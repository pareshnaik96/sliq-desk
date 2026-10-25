import { describe, expect, it } from 'vitest';
import { ACTIONS, can } from '../src/policies/index.js';

// Exhaustive matrix: 3 roles x every action x every ticket situation that matters.
const ORG = 'a'.repeat(24);
const ME = '1'.repeat(24);
const OTHER = '2'.repeat(24);
const actor = (role) => ({ orgId: ORG, userId: ME, role });

const tickets = {
  unassigned: { orgId: ORG, assigneeId: null },
  mine: { orgId: ORG, assigneeId: ME },
  otherAgents: { orgId: ORG, assigneeId: OTHER },
};
const targets = { self: ME, otherAgent: OTHER, nobody: null };

const Y = true;
const N = false;

// [admin, agent, viewer]
const simple = {
  'ticket:view': [Y, Y, Y],
  'comment:view': [Y, Y, Y],
  'member:view': [Y, Y, Y],
  'ticket:create': [Y, Y, N],
  'comment:create': [Y, Y, N],
  'member:manage': [Y, N, N],
};

const update = {
  unassigned: [Y, Y, N],
  mine: [Y, Y, N],
  otherAgents: [Y, N, N],
};

// assign[ticket][target] = [admin, agent, viewer]
const assign = {
  unassigned: { self: [Y, Y, N], otherAgent: [Y, N, N], nobody: [Y, Y, N] },
  mine: { self: [Y, Y, N], otherAgent: [Y, N, N], nobody: [Y, Y, N] },
  otherAgents: { self: [Y, N, N], otherAgent: [Y, N, N], nobody: [Y, N, N] },
};

const ROLES = ['admin', 'agent', 'viewer'];

describe('policy matrix', () => {
  it('covers every action', () => {
    expect([...Object.keys(simple), 'ticket:update', 'ticket:assign'].sort()).toEqual(
      [...ACTIONS].sort(),
    );
  });

  for (const [action, expected] of Object.entries(simple))
    ROLES.forEach((role, i) =>
      it(`${role} ${expected[i] ? 'can' : 'cannot'} ${action}`, () => {
        expect(can(actor(role), action, tickets.unassigned)).toBe(expected[i]);
      }),
    );

  for (const [situation, expected] of Object.entries(update))
    ROLES.forEach((role, i) =>
      it(`${role} ${expected[i] ? 'can' : 'cannot'} update a ${situation} ticket`, () => {
        expect(can(actor(role), 'ticket:update', tickets[situation])).toBe(expected[i]);
      }),
    );

  for (const [situation, byTarget] of Object.entries(assign))
    for (const [target, expected] of Object.entries(byTarget))
      ROLES.forEach((role, i) =>
        it(`${role} ${expected[i] ? 'can' : 'cannot'} assign a ${situation} ticket to ${target}`, () => {
          const resource = { ticket: tickets[situation], assigneeId: targets[target] };
          expect(can(actor(role), 'ticket:assign', resource)).toBe(expected[i]);
        }),
      );

  it('denies every action on another org’s ticket for every role', () => {
    const foreign = { orgId: 'b'.repeat(24), assigneeId: null };
    for (const role of ROLES) {
      for (const action of ['ticket:view', 'ticket:update', 'comment:view', 'comment:create'])
        expect(can(actor(role), action, foreign)).toBe(false);
      expect(can(actor(role), 'ticket:assign', { ticket: foreign, assigneeId: null })).toBe(false);
    }
  });
});
