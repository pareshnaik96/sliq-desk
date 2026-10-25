// UI-only mirror of the server policies, used to hide controls a user cannot
// use. The server remains the source of truth and re-checks every request.

export const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
export const ROLES = ['admin', 'agent', 'viewer'];

export const TRANSITIONS = {
  open: ['in_progress', 'resolved', 'closed'],
  in_progress: ['open', 'resolved', 'closed'],
  resolved: ['in_progress', 'closed'],
  closed: [],
};

export const isStaff = (user) => user?.role === 'admin' || user?.role === 'agent';
export const canCreateTicket = isStaff;
export const canComment = (user, ticket) => isStaff(user) && ticket?.status !== 'closed';
export const canManageMembers = (user) => user?.role === 'admin';

export function canUpdateTicket(user, ticket) {
  if (!ticket || ticket.status === 'closed') return false;
  if (user?.role === 'admin') return true;
  if (user?.role !== 'agent') return false;
  return ticket.assigneeId == null || ticket.assigneeId === user.id;
}

/** Assignee ids the user may choose for this ticket (null = unassigned). */
export function assignableOptions(user, ticket, members) {
  if (!canUpdateTicket(user, ticket)) return [];
  if (user.role === 'admin')
    return [null, ...members.filter((m) => m.role !== 'viewer').map((m) => m.id)];
  return [null, user.id];
}

export const label = (value) => value.replace('_', ' ');
