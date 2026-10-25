/**
 * Pure permission rules: no I/O. The actor is the TenantContext built from the
 * DB user ({ orgId, userId, role }); the resource is the ticket being acted on.
 * For 'ticket:assign' the resource is { ticket, assigneeId } where assigneeId
 * is the requested new assignee (null = unassign).
 */

export const ACTIONS = Object.freeze([
  'ticket:view',
  'ticket:create',
  'ticket:update',
  'ticket:assign',
  'comment:view',
  'comment:create',
  'member:view',
  'member:manage',
]);

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/** Agents may work on a ticket that is unassigned or assigned to them. */
const agentMayTouch = (actor, ticket) =>
  ticket != null && (ticket.assigneeId == null || sameId(ticket.assigneeId, actor.userId));

export function can(actor, action, resource) {
  if (!ACTIONS.includes(action)) throw new Error(`Unknown action: ${action}`);
  if (!actor?.role) return false;

  // Defence in depth: repositories already scope by org, but never allow
  // acting on a resource from another org even if one slips through.
  const ticket = action === 'ticket:assign' ? resource?.ticket : resource;
  if (ticket?.orgId != null && !sameId(ticket.orgId, actor.orgId)) return false;

  const { role } = actor;
  switch (action) {
    case 'ticket:view':
    case 'comment:view':
    case 'member:view':
      return true;

    case 'ticket:create':
    case 'comment:create':
      return role === 'admin' || role === 'agent';

    case 'ticket:update': // status, priority, title, description
      if (role === 'admin') return true;
      return role === 'agent' && agentMayTouch(actor, ticket);

    case 'ticket:assign': {
      if (role === 'admin') return true;
      const { assigneeId } = resource ?? {};
      const toSelfOrNobody = assigneeId == null || sameId(assigneeId, actor.userId);
      return role === 'agent' && agentMayTouch(actor, ticket) && toSelfOrNobody;
    }

    case 'member:manage':
      return role === 'admin';
  }
}
