import { SLA_PRIORITIES } from '../domain/constants.js';
import { canTransition, isTerminal, TRANSITIONS } from '../domain/workflow.js';
import { bus, EVENTS } from '../events/bus.js';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../errors.js';
import { can } from '../policies/index.js';
import { organizationsRepo, ticketsRepo, usersRepo } from '../repositories/index.js';
import { serializeTicket } from '../serializers.js';

const sameId = (a, b) => String(a ?? null) === String(b ?? null);
const needsSla = (priority) => SLA_PRIORITIES.includes(priority);

/** now + the org's SLA window. */
async function slaDeadline(ctx) {
  const org = await organizationsRepo.get(ctx);
  return new Date(Date.now() + org.slaMinutes * 60_000);
}

async function assertAssignable(ctx, assigneeId) {
  if (assigneeId == null) return;
  // Same message whether the user is in another org, a viewer, removed or nonexistent.
  if (!(await usersRepo.findAssignable(ctx, assigneeId)))
    throw badRequest(
      'INVALID_ASSIGNEE',
      'Assignee must be an active admin or agent in your organization',
    );
}

// --- cursor ---------------------------------------------------------------
// The cursor is the sort key of the last item on the page: "<createdAt ms>_<_id>".

export const encodeCursor = (t) => `${t.createdAt.getTime()}_${t._id}`;

export function decodeCursor(raw) {
  const match = /^(\d{1,15})_([a-f\d]{24})$/i.exec(raw);
  if (!match) throw badRequest('INVALID_CURSOR', 'Cursor is invalid');
  return { createdAt: new Date(Number(match[1])), id: match[2] };
}

// --- queries --------------------------------------------------------------

export async function list(ctx, { status, priority, assignee, cursor, limit }) {
  if (!can(ctx, 'ticket:view')) throw forbidden();
  let assigneeId;
  if (assignee === 'me') assigneeId = ctx.userId;
  else if (assignee === 'unassigned') assigneeId = null;
  else if (assignee) assigneeId = assignee;

  const rows = await ticketsRepo.list(ctx, {
    status,
    priority,
    assigneeId,
    cursor: cursor ? decodeCursor(cursor) : undefined,
    limit,
  });
  const page = rows.slice(0, limit);
  return {
    items: page.map(serializeTicket),
    nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
  };
}

export async function get(ctx, id) {
  const ticket = await ticketsRepo.findById(ctx, id);
  if (!ticket || !can(ctx, 'ticket:view', ticket)) throw notFound('Ticket');
  return serializeTicket(ticket);
}

// --- commands -------------------------------------------------------------

export async function create(ctx, { title, description, priority, assigneeId }) {
  if (!can(ctx, 'ticket:create')) throw forbidden();
  if (assigneeId != null) {
    const draft = { orgId: ctx.orgId, assigneeId: null };
    if (!can(ctx, 'ticket:assign', { ticket: draft, assigneeId }))
      throw forbidden('Agents may only assign tickets to themselves');
    await assertAssignable(ctx, assigneeId);
  }

  const ticket = await ticketsRepo.create(ctx, {
    number: await ticketsRepo.nextNumber(ctx),
    title,
    description,
    priority,
    status: 'open',
    assigneeId: assigneeId ?? null,
    createdBy: ctx.userId,
    slaDueAt: needsSla(priority) ? await slaDeadline(ctx) : null,
  });

  const dto = serializeTicket(ticket);
  bus.publish(ctx.orgId, EVENTS.TICKET_CREATED, { ticketId: dto.id, number: dto.number });
  return dto;
}

/**
 * Apply a partial update. Order of checks: 404 -> 403 -> 422 (closed / bad
 * transition) -> 400 (assignee) -> atomic write (409 on concurrent change).
 */
export async function update(ctx, id, patch) {
  const ticket = await ticketsRepo.findById(ctx, id);
  if (!ticket) throw notFound('Ticket');
  if (!can(ctx, 'ticket:update', ticket)) throw forbidden();
  if (isTerminal(ticket.status))
    throw unprocessable('TICKET_CLOSED', 'Closed tickets cannot be changed');

  const set = {};
  if (patch.title !== undefined && patch.title !== ticket.title) set.title = patch.title;
  if (patch.description !== undefined && patch.description !== ticket.description)
    set.description = patch.description;

  if (patch.status !== undefined && patch.status !== ticket.status) {
    if (!canTransition(ticket.status, patch.status))
      throw unprocessable(
        'INVALID_TRANSITION',
        `Cannot move a ticket from ${ticket.status} to ${patch.status}`,
        { from: ticket.status, to: patch.status, allowed: TRANSITIONS[ticket.status] },
      );
    set.status = patch.status;
  }

  if (patch.assigneeId !== undefined && !sameId(patch.assigneeId, ticket.assigneeId)) {
    if (!can(ctx, 'ticket:assign', { ticket, assigneeId: patch.assigneeId }))
      throw forbidden('Agents may only assign tickets to themselves or unassign them');
    await assertAssignable(ctx, patch.assigneeId);
    set.assigneeId = patch.assigneeId;
  }

  if (patch.priority !== undefined && patch.priority !== ticket.priority) {
    set.priority = patch.priority;
    // Raising to high/urgent starts the SLA clock; lowering cancels a pending one.
    const pending = !ticket.overdue && ticket.firstStaffResponseAt == null;
    if (pending && needsSla(patch.priority) && !needsSla(ticket.priority))
      set.slaDueAt = await slaDeadline(ctx);
    else if (pending && !needsSla(patch.priority) && needsSla(ticket.priority)) set.slaDueAt = null;
  }

  if (Object.keys(set).length === 0) return serializeTicket(ticket);

  const updated = await ticketsRepo.updateIfUnchanged(ctx, id, ticket, set);
  if (!updated)
    throw conflict('CONFLICT', 'The ticket was changed by someone else; reload and try again');

  const dto = serializeTicket(updated);
  const changes = Object.fromEntries(Object.keys(set).map((k) => [k, dto[k]]));
  bus.publish(ctx.orgId, EVENTS.TICKET_UPDATED, {
    ticketId: dto.id,
    number: dto.number,
    changes: { ...changes, updatedAt: dto.updatedAt },
  });
  return dto;
}
