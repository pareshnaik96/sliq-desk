import { describe, expect, it } from 'vitest';
import { TICKET_STATUSES } from '../src/domain/constants.js';
import { canTransition, isTerminal } from '../src/domain/workflow.js';

const allowed = {
  open: ['in_progress', 'resolved', 'closed'],
  in_progress: ['open', 'resolved', 'closed'],
  resolved: ['in_progress', 'closed'],
  closed: [],
};

describe('ticket workflow', () => {
  for (const from of TICKET_STATUSES) {
    for (const to of TICKET_STATUSES) {
      const expected = allowed[from].includes(to);
      it(`${from} -> ${to} is ${expected ? 'allowed' : 'rejected'}`, () => {
        expect(canTransition(from, to)).toBe(expected);
      });
    }
  }

  it('treats closed as terminal', () => {
    expect(isTerminal('closed')).toBe(true);
    expect(isTerminal('resolved')).toBe(false);
  });
});
