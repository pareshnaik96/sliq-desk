/** Allowed ticket status transitions. "closed" is terminal. */
export const TRANSITIONS = Object.freeze({
  open: Object.freeze(['in_progress', 'resolved', 'closed']),
  in_progress: Object.freeze(['open', 'resolved', 'closed']),
  resolved: Object.freeze(['in_progress', 'closed']),
  closed: Object.freeze([]),
});

export const isTerminal = (status) => TRANSITIONS[status]?.length === 0;

export const canTransition = (from, to) => TRANSITIONS[from]?.includes(to) ?? false;
