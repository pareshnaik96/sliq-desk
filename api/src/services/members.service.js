import { generateTemporaryPassword, hashPassword } from '../auth/passwords.js';
import { bus, EVENTS } from '../events/bus.js';
import { conflict, forbidden, notFound } from '../errors.js';
import { can } from '../policies/index.js';
import {
  authRepo,
  organizationsRepo,
  ticketsRepo,
  usersRepo,
  withTransaction,
} from '../repositories/index.js';
import { serializeUser } from '../serializers.js';

const lastAdmin = () =>
  conflict('LAST_ADMIN', 'An organization must keep at least one active admin');

const assertManage = (ctx) => {
  if (!can(ctx, 'member:manage')) throw forbidden();
};

export async function list(ctx) {
  if (!can(ctx, 'member:view')) throw forbidden();
  return (await usersRepo.listActive(ctx)).map(serializeUser);
}

/**
 * Assumption: there is no email delivery, so the admin receives a generated
 * temporary password exactly once in the response and shares it out of band.
 */
export async function create(ctx, { email, name, role }) {
  assertManage(ctx);
  if (await authRepo.emailExists(email))
    throw conflict('EMAIL_TAKEN', 'An account with this email already exists');
  const temporaryPassword = generateTemporaryPassword();
  const member = await usersRepo.create(ctx, {
    email,
    name,
    role,
    passwordHash: await hashPassword(temporaryPassword),
  });
  bus.publish(ctx.orgId, EVENTS.MEMBER_CHANGED, {
    memberId: String(member._id),
    change: 'added',
    role,
  });
  return { member: serializeUser(member), temporaryPassword };
}

/*
 * Last-admin protection.
 * Role changes and removals run in a transaction that FIRST increments
 * org.membershipVersion. If two admins demote each other at the same moment,
 * both transactions write that same org document, so MongoDB aborts one with
 * a write conflict and the driver retries it. The retry then counts admins
 * again, sees only one left, and refuses. Without the shared write, both
 * transactions could count "2 admins" and both succeed.
 */
async function assertAnotherActiveAdmin(ctx, session) {
  const admins = await usersRepo.countActiveAdmins(ctx, { session });
  if (admins <= 1) throw lastAdmin();
}

export async function changeRole(ctx, id, role) {
  assertManage(ctx);
  const result = await withTransaction(async (session) => {
    await organizationsRepo.bumpMembershipVersion(ctx, session); // see "Last-admin protection"
    const target = await usersRepo.findActiveById(ctx, id, { session });
    if (!target) throw notFound('Member');
    if (target.role === role) return { member: target, changed: false };
    if (target.role === 'admin') await assertAnotherActiveAdmin(ctx, session);

    const member = await usersRepo.updateRole(ctx, id, role, { session });
    // Viewers cannot hold tickets.
    if (role === 'viewer') await ticketsRepo.unassignAllFrom(ctx, id, { session });
    return { member, changed: true };
  });

  if (result.changed) {
    bus.publish(ctx.orgId, EVENTS.MEMBER_CHANGED, { memberId: String(id), change: 'role', role });
    bus.disconnectUser(id);
  }
  return serializeUser(result.member);
}

export async function remove(ctx, id) {
  assertManage(ctx);
  await withTransaction(async (session) => {
    await organizationsRepo.bumpMembershipVersion(ctx, session); // see "Last-admin protection"
    const target = await usersRepo.findActiveById(ctx, id, { session });
    if (!target) throw notFound('Member');
    if (target.role === 'admin') await assertAnotherActiveAdmin(ctx, session);

    await usersRepo.markRemoved(ctx, id, { session });
    await ticketsRepo.unassignAllFrom(ctx, id, { session });
  });
  bus.publish(ctx.orgId, EVENTS.MEMBER_CHANGED, { memberId: String(id), change: 'removed' });
  bus.disconnectUser(id);
}
