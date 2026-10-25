import { describe, expect, it } from 'vitest';
import {
  assignableOptions,
  canComment,
  canCreateTicket,
  canManageMembers,
  canUpdateTicket,
} from '../src/lib/permissions.js';

const admin = { id: 'a', role: 'admin' };
const agent = { id: 'g', role: 'agent' };
const viewer = { id: 'v', role: 'viewer' };
const members = [admin, agent, { id: 'g2', role: 'agent' }, viewer];

describe('UI permission mirror', () => {
  it('matches server rules for creating, commenting and managing members', () => {
    expect([admin, agent, viewer].map(canCreateTicket)).toEqual([true, true, false]);
    expect(canComment(agent, { status: 'open' })).toBe(true);
    expect(canComment(agent, { status: 'closed' })).toBe(false);
    expect(canComment(viewer, { status: 'open' })).toBe(false);
    expect(canManageMembers(admin)).toBe(true);
    expect(canManageMembers(agent)).toBe(false);
  });

  it('lets agents update only unassigned or own tickets, and nobody update closed ones', () => {
    expect(canUpdateTicket(agent, { status: 'open', assigneeId: null })).toBe(true);
    expect(canUpdateTicket(agent, { status: 'open', assigneeId: 'g' })).toBe(true);
    expect(canUpdateTicket(agent, { status: 'open', assigneeId: 'g2' })).toBe(false);
    expect(canUpdateTicket(admin, { status: 'closed', assigneeId: null })).toBe(false);
    expect(canUpdateTicket(viewer, { status: 'open', assigneeId: null })).toBe(false);
  });

  it('offers agents only self/unassigned and admins every staff member', () => {
    const ticket = { status: 'open', assigneeId: null };
    expect(assignableOptions(agent, ticket, members)).toEqual([null, 'g']);
    expect(assignableOptions(admin, ticket, members)).toEqual([null, 'a', 'g', 'g2']);
    expect(assignableOptions(viewer, ticket, members)).toEqual([]);
  });
});
