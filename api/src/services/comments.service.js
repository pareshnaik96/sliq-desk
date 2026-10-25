import { isTerminal } from '../domain/workflow.js';
import { bus, EVENTS } from '../events/bus.js';
import { forbidden, notFound, unprocessable } from '../errors.js';
import { can } from '../policies/index.js';
import { commentsRepo, ticketsRepo, withTransaction } from '../repositories/index.js';
import { serializeComment } from '../serializers.js';

async function loadTicket(ctx, ticketId) {
  const ticket = await ticketsRepo.findById(ctx, ticketId);
  if (!ticket) throw notFound('Ticket');
  return ticket;
}

export async function list(ctx, ticketId) {
  if (!can(ctx, 'comment:view', await loadTicket(ctx, ticketId))) throw notFound('Ticket');
  return (await commentsRepo.listForTicket(ctx, ticketId)).map(serializeComment);
}

/**
 * Only admins and agents can comment, so every comment is a staff response:
 * the first one stamps firstStaffResponseAt (which stops the SLA clock).
 */
export async function create(ctx, ticketId, { body }) {
  const ticket = await loadTicket(ctx, ticketId);
  if (!can(ctx, 'comment:create', ticket)) throw forbidden();
  if (isTerminal(ticket.status))
    throw unprocessable('TICKET_CLOSED', 'Closed tickets cannot be changed');

  const now = new Date();
  const { comment, responded } = await withTransaction(async (session) => {
    const comment = await commentsRepo.create(
      ctx,
      { ticketId: ticket._id, authorId: ctx.userId, authorRole: ctx.role, body },
      { session },
    );
    const responded = await ticketsRepo.markFirstStaffResponse(ctx, ticket._id, now, { session });
    return { comment, responded };
  });

  const dto = serializeComment(comment);
  bus.publish(ctx.orgId, EVENTS.COMMENT_CREATED, {
    ticketId: dto.ticketId,
    commentId: dto.id,
    authorId: dto.authorId,
  });
  if (responded)
    bus.publish(ctx.orgId, EVENTS.TICKET_UPDATED, {
      ticketId: dto.ticketId,
      number: responded.number,
      changes: {
        firstStaffResponseAt: responded.firstStaffResponseAt,
        updatedAt: responded.updatedAt,
      },
    });
  return dto;
}
