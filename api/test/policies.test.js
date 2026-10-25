import { describe, expect, it } from 'vitest';
import { can } from '../src/policies/index.js';

const ORG = 'a'.repeat(24);
const OTHER_ORG = 'b'.repeat(24);
const admin = { orgId: ORG, userId: '1'.repeat(24), role: 'admin' };
const agent = { orgId: ORG, userId: '2'.repeat(24), role: 'agent' };
const otherAgent = '3'.repeat(24);
const viewer = { orgId: ORG, userId: '4'.repeat(24), role: 'viewer' };

const ticket = (assigneeId = null, orgId = ORG) => ({ orgId, assigneeId });
const assign = (actor, t, assigneeId) => can(actor, 'ticket:assign', { ticket: t, assigneeId });

describe('policies.can', () => {
  it('lets every role view tickets, comments and members', () => {
    for (const actor of [admin, agent, viewer]) {
      expect(can(actor, 'ticket:view')).toBe(true);
      expect(can(actor, 'comment:view')).toBe(true);
      expect(can(actor, 'member:view')).toBe(true);
    }
  });

  it('lets only admins and agents create tickets and comments', () => {
    expect(can(admin, 'ticket:create')).toBe(true);
    expect(can(agent, 'ticket:create')).toBe(true);
    expect(can(viewer, 'ticket:create')).toBe(false);
    expect(can(admin, 'comment:create')).toBe(true);
    expect(can(agent, 'comment:create')).toBe(true);
    expect(can(viewer, 'comment:create')).toBe(false);
  });

  it('lets admins update any ticket', () => {
    expect(can(admin, 'ticket:update', ticket(otherAgent))).toBe(true);
  });

  it('lets agents update only unassigned tickets or their own', () => {
    expect(can(agent, 'ticket:update', ticket(null))).toBe(true);
    expect(can(agent, 'ticket:update', ticket(agent.userId))).toBe(true);
    expect(can(agent, 'ticket:update', ticket(otherAgent))).toBe(false);
  });

  it('never lets viewers update', () => {
    expect(can(viewer, 'ticket:update', ticket(null))).toBe(false);
    expect(can(viewer, 'ticket:update', ticket(viewer.userId))).toBe(false);
  });

  it('lets agents assign only to themselves or unassign', () => {
    expect(assign(agent, ticket(null), agent.userId)).toBe(true);
    expect(assign(agent, ticket(agent.userId), null)).toBe(true);
    expect(assign(agent, ticket(null), otherAgent)).toBe(false);
    // Cannot take a ticket that already belongs to another agent.
    expect(assign(agent, ticket(otherAgent), agent.userId)).toBe(false);
  });

  it('lets admins assign to anyone and viewers to no one', () => {
    expect(assign(admin, ticket(null), otherAgent)).toBe(true);
    expect(assign(viewer, ticket(null), null)).toBe(false);
  });

  it('restricts member management to admins', () => {
    expect(can(admin, 'member:manage')).toBe(true);
    expect(can(agent, 'member:manage')).toBe(false);
    expect(can(viewer, 'member:manage')).toBe(false);
  });

  it('denies acting on a resource from another org, even for admins', () => {
    expect(can(admin, 'ticket:update', ticket(null, OTHER_ORG))).toBe(false);
    expect(can(admin, 'ticket:view', ticket(null, OTHER_ORG))).toBe(false);
    expect(assign(admin, ticket(null, OTHER_ORG), null)).toBe(false);
  });

  it('denies missing actors and rejects unknown actions', () => {
    expect(can(null, 'ticket:view')).toBe(false);
    expect(() => can(admin, 'ticket:delete')).toThrow(/Unknown action/);
  });
});
