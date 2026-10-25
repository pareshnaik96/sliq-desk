import { hashPassword } from '../auth/passwords.js';
import { toTenantContext } from '../auth/session.js';
import { Organization } from '../models/index.js';
import { authRepo, usersRepo } from '../repositories/index.js';
import * as comments from '../services/comments.service.js';
import * as tickets from '../services/tickets.service.js';

/** Shared password for every seeded account (documented in the README). */
export const SEED_PASSWORD = 'sliqdesk-dev';

const ORGS = [
  {
    name: 'Acme Support',
    domain: 'acme.test',
    people: { admin: 'Acme Admin', agent: 'Acme Agent', viewer: 'Acme Viewer' },
  },
  {
    name: 'Globex Help Desk',
    domain: 'globex.test',
    people: { admin: 'Globex Admin', agent: 'Globex Agent', viewer: 'Globex Viewer' },
  },
];

/**
 * Tickets are created through the real services so numbering, SLA deadlines
 * and first-response stamps behave exactly as in the app.
 *  - one assigned to the agent, two unassigned (one urgent and unanswered, so
 *    it breaches the SLA a couple of minutes after startup), and a mix of
 *    statuses and priorities.
 */
const TICKETS = [
  {
    title: 'Cannot log in after password reset',
    description: 'Customer reports the reset link works but the new password is rejected.',
    priority: 'high',
    assignee: 'agent',
    status: 'in_progress',
    reply: { by: 'agent', body: 'Reproduced it. Looking into the session cache now.' },
  },
  {
    title: 'Invoice PDF shows the wrong VAT rate',
    description: 'October invoices for EU customers show 19% instead of 21%.',
    priority: 'medium',
  },
  {
    title: 'Checkout page returns 500 for some customers',
    description: 'Started after the latest deploy. Nobody has picked this up yet.',
    priority: 'urgent',
  },
  {
    title: 'Add CSV export to the reports page',
    priority: 'low',
    assignee: 'admin',
    status: 'resolved',
  },
  { title: 'Typo on the pricing page', priority: 'low', status: 'closed' },
];

/** Seed demo data only when the database has no organizations at all. */
export async function seedIfEmpty({ config, logger }) {
  if ((await Organization.estimatedDocumentCount()) > 0) {
    logger?.info('Seed skipped: database already has data');
    return { seeded: false };
  }

  const passwordHash = await hashPassword(SEED_PASSWORD);
  const logins = [];

  for (const { name, domain, people } of ORGS) {
    const { org, user: admin } = await authRepo.createOrganizationWithAdmin({
      orgName: name,
      slaMinutes: config.slaMinutes,
      email: `admin@${domain}`,
      name: people.admin,
      passwordHash,
    });
    const ctx = { admin: toTenantContext(admin) };
    for (const role of ['agent', 'viewer']) {
      const user = await usersRepo.create(ctx.admin, {
        email: `${role}@${domain}`,
        name: people[role],
        role,
        passwordHash,
      });
      ctx[role] = toTenantContext(user);
    }

    for (const t of TICKETS) {
      const ticket = await tickets.create(ctx.admin, {
        title: t.title,
        description: t.description ?? '',
        priority: t.priority,
        assigneeId: t.assignee ? String(ctx[t.assignee].userId) : null,
      });
      if (t.reply) await comments.create(ctx[t.reply.by], ticket.id, { body: t.reply.body });
      if (t.status) await tickets.update(ctx.admin, ticket.id, { status: t.status });
    }

    logins.push(...['admin', 'agent', 'viewer'].map((r) => `${r}@${domain}`));
    logger?.info({ org: org.name }, 'Seeded organization');
  }

  logger?.info({ logins, password: SEED_PASSWORD }, 'Seed complete');
  return { seeded: true, logins };
}
