import { afterEach, describe, expect, it, vi } from 'vitest';
import { ticketsRepo } from '../src/repositories/index.js';
import { addMember, signupOrg, useTestApp } from './helpers.js';

const t = useTestApp();

afterEach(() => vi.restoreAllMocks());

/** Org with an admin, two agents and a viewer. */
async function team() {
  const admin = await signupOrg(t.app);
  const agent = await addMember(t.app, admin.agent, 'agent', 'Agent One');
  const agent2 = await addMember(t.app, admin.agent, 'agent', 'Agent Two');
  const viewer = await addMember(t.app, admin.agent, 'viewer');
  return { admin, agent, agent2, viewer };
}

const create = (who, body = {}) =>
  who.agent
    .post('/tickets')
    .send({ title: 'Printer on fire', ...body })
    .expect(201)
    .then((r) => r.body);

describe('tickets: create & read', () => {
  it('creates tickets with per-org sequential numbers', async () => {
    const a = await signupOrg(t.app);
    const b = await signupOrg(t.app);
    const [a1, a2, b1] = [await create(a), await create(a), await create(b)];
    expect([a1.number, a2.number, b1.number]).toEqual([1, 2, 1]);
    expect(a1).toMatchObject({
      status: 'open',
      priority: 'medium',
      assigneeId: null,
      overdue: false,
    });
    expect(a1.createdBy).toBe(a.user.id);
  });

  it('allocates unique numbers under concurrency', async () => {
    const a = await signupOrg(t.app);
    const created = await Promise.all(Array.from({ length: 10 }, () => create(a)));
    expect(new Set(created.map((c) => c.number)).size).toBe(10);
  });

  it('forbids viewers from creating tickets', async () => {
    const { viewer } = await team();
    const res = await viewer.agent.post('/tickets').send({ title: 'x' }).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('sets an SLA deadline only for high/urgent tickets', async () => {
    const a = await signupOrg(t.app);
    const before = Date.now();
    const urgent = await create(a, { priority: 'urgent' });
    const low = await create(a, { priority: 'low' });
    const due = new Date(urgent.slaDueAt).getTime();
    expect(due).toBeGreaterThanOrEqual(before + 30 * 60_000);
    expect(due).toBeLessThan(Date.now() + 30 * 60_000 + 1000);
    expect(low.slaDueAt).toBeNull();
  });

  it('validates assignees: same org, active, admin or agent', async () => {
    const { admin, viewer } = await team();
    const other = await signupOrg(t.app);
    for (const assigneeId of [viewer.user.id, other.user.id, 'f'.repeat(24)]) {
      const res = await admin.agent.post('/tickets').send({ title: 'x', assigneeId }).expect(400);
      expect(res.body.error.code).toBe('INVALID_ASSIGNEE');
    }
  });

  it('lets an agent create a ticket assigned only to themselves', async () => {
    const { agent, agent2 } = await team();
    await create(agent, { assigneeId: agent.user.id });
    await agent.agent.post('/tickets').send({ title: 'x', assigneeId: agent2.user.id }).expect(403);
  });

  it('rejects unknown keys, client-supplied orgId and operator objects', async () => {
    const { admin } = await team();
    for (const body of [
      { title: 'x', orgId: 'a'.repeat(24) },
      { title: 'x', number: 7 },
      { title: { $ne: null } },
      { title: 'x', assigneeId: { $ne: null } },
    ]) {
      const res = await admin.agent.post('/tickets').send(body).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    await admin.agent.get('/tickets?orgId=' + 'a'.repeat(24)).expect(400);
    await admin.agent.get('/tickets?status[$ne]=open').expect(400);
    await admin.agent.get('/tickets?limit=500').expect(400);
  });
});

describe('tickets: list & pagination', () => {
  it('pages with a keyset cursor without gaps or duplicates', async () => {
    const a = await signupOrg(t.app);
    for (let i = 0; i < 25; i++) await create(a, { title: `t${i}` });

    const seen = [];
    let cursor;
    let pages = 0;
    do {
      const q = cursor ? `?limit=10&cursor=${cursor}` : '?limit=10';
      const res = await a.agent.get(`/tickets${q}`).expect(200);
      seen.push(...res.body.items.map((i) => i.number));
      cursor = res.body.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(seen).toEqual(Array.from({ length: 25 }, (_, i) => 25 - i));
  });

  it('defaults to 20 items and rejects bad cursors', async () => {
    const a = await signupOrg(t.app);
    for (let i = 0; i < 21; i++) await create(a);
    const res = await a.agent.get('/tickets').expect(200);
    expect(res.body.items).toHaveLength(20);
    expect(res.body.nextCursor).toEqual(expect.any(String));
    const bad = await a.agent.get('/tickets?cursor=nonsense').expect(400);
    expect(bad.body.error.code).toBe('INVALID_CURSOR');
  });

  it('filters by status, priority and assignee', async () => {
    const { admin, agent } = await team();
    const mine = await create(agent, { assigneeId: agent.user.id, priority: 'high' });
    const open = await create(admin, { priority: 'low' });
    await admin.agent.patch(`/tickets/${open.id}`).send({ status: 'resolved' }).expect(200);

    const ids = async (q, who = admin) =>
      (await who.agent.get(`/tickets?${q}`).expect(200)).body.items.map((i) => i.id);
    expect(await ids('status=resolved')).toEqual([open.id]);
    expect(await ids('priority=high')).toEqual([mine.id]);
    expect(await ids(`assignee=${agent.user.id}`)).toEqual([mine.id]);
    expect(await ids('assignee=me', agent)).toEqual([mine.id]);
    expect(await ids('assignee=unassigned')).toEqual([open.id]);
  });
});

describe('tickets: tenant isolation', () => {
  it("returns 404 for another org's tickets and comments and hides them from lists", async () => {
    const a = await signupOrg(t.app);
    const b = await signupOrg(t.app);
    const ticket = await create(a);

    await b.agent.get(`/tickets/${ticket.id}`).expect(404);
    await b.agent.patch(`/tickets/${ticket.id}`).send({ status: 'closed' }).expect(404);
    await b.agent.get(`/tickets/${ticket.id}/comments`).expect(404);
    await b.agent.post(`/tickets/${ticket.id}/comments`).send({ body: 'hi' }).expect(404);
    const list = await b.agent.get('/tickets').expect(200);
    expect(list.body.items.map((i) => i.id)).not.toContain(ticket.id);

    const still = await a.agent.get(`/tickets/${ticket.id}`).expect(200);
    expect(still.body.status).toBe('open');
  });

  it("cannot assign a ticket to another org's user", async () => {
    const a = await signupOrg(t.app);
    const b = await signupOrg(t.app);
    const ticket = await create(a);
    const res = await a.agent
      .patch(`/tickets/${ticket.id}`)
      .send({ assigneeId: b.user.id })
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_ASSIGNEE');
  });

  it('cannot filter another org into view via the assignee query', async () => {
    const a = await signupOrg(t.app);
    const b = await signupOrg(t.app);
    await create(b, { assigneeId: b.user.id });
    const res = await a.agent.get(`/tickets?assignee=${b.user.id}`).expect(200);
    expect(res.body.items).toEqual([]);
  });
});

describe('tickets: update permissions & workflow', () => {
  it('lets admins update any ticket and viewers none', async () => {
    const { admin, agent, viewer } = await team();
    const held = await create(agent, { assigneeId: agent.user.id });
    await admin.agent.patch(`/tickets/${held.id}`).send({ priority: 'urgent' }).expect(200);
    await viewer.agent.patch(`/tickets/${held.id}`).send({ priority: 'low' }).expect(403);
  });

  it('lets agents update unassigned or own tickets only', async () => {
    const { admin, agent, agent2 } = await team();
    const unassigned = await create(admin);
    const theirs = await create(admin, { assigneeId: agent2.user.id });
    await agent.agent
      .patch(`/tickets/${unassigned.id}`)
      .send({ status: 'in_progress' })
      .expect(200);
    await agent.agent.patch(`/tickets/${theirs.id}`).send({ status: 'in_progress' }).expect(403);
    await agent.agent.patch(`/tickets/${theirs.id}`).send({ title: 'mine now' }).expect(403);
  });

  it('lets agents assign only to themselves or unassign', async () => {
    const { admin, agent, agent2 } = await team();
    const ticket = await create(admin);
    await agent.agent
      .patch(`/tickets/${ticket.id}`)
      .send({ assigneeId: agent2.user.id })
      .expect(403);
    await agent.agent
      .patch(`/tickets/${ticket.id}`)
      .send({ assigneeId: agent.user.id })
      .expect(200);
    await agent.agent.patch(`/tickets/${ticket.id}`).send({ assigneeId: null }).expect(200);
    // Admin may assign to anyone.
    const res = await admin.agent
      .patch(`/tickets/${ticket.id}`)
      .send({ assigneeId: agent2.user.id })
      .expect(200);
    expect(res.body.assigneeId).toBe(agent2.user.id);
  });

  it('enforces the status workflow with 422', async () => {
    const { admin } = await team();
    const ticket = await create(admin);
    await admin.agent.patch(`/tickets/${ticket.id}`).send({ status: 'resolved' }).expect(200);
    const bad = await admin.agent
      .patch(`/tickets/${ticket.id}`)
      .send({ status: 'open' })
      .expect(422);
    expect(bad.body.error).toMatchObject({
      code: 'INVALID_TRANSITION',
      details: { from: 'resolved', to: 'open', allowed: ['in_progress', 'closed'] },
    });
    await admin.agent.patch(`/tickets/${ticket.id}`).send({ status: 'in_progress' }).expect(200);
  });

  it('treats closed as terminal for every kind of change', async () => {
    const { admin } = await team();
    const ticket = await create(admin);
    await admin.agent.patch(`/tickets/${ticket.id}`).send({ status: 'closed' }).expect(200);
    for (const body of [
      { status: 'open' },
      { priority: 'urgent' },
      { title: 'renamed' },
      { assigneeId: admin.user.id },
    ]) {
      const res = await admin.agent.patch(`/tickets/${ticket.id}`).send(body).expect(422);
      expect(res.body.error.code).toBe('TICKET_CLOSED');
    }
    await admin.agent.post(`/tickets/${ticket.id}/comments`).send({ body: 'late' }).expect(422);
  });

  it('returns 409 when the ticket changed between read and write', async () => {
    const { admin } = await team();
    const ticket = await create(admin);
    const stale = await ticketsRepo.findById(await orgCtx(admin), ticket.id);
    await admin.agent.patch(`/tickets/${ticket.id}`).send({ status: 'in_progress' }).expect(200);

    // Simulate a concurrent writer: the service reads the old snapshot.
    vi.spyOn(ticketsRepo, 'findById').mockResolvedValueOnce(stale);
    const res = await admin.agent
      .patch(`/tickets/${ticket.id}`)
      .send({ status: 'resolved' })
      .expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('starts the SLA clock when priority is raised and cancels it when lowered', async () => {
    const { admin } = await team();
    const ticket = await create(admin, { priority: 'low' });
    const raised = await admin.agent
      .patch(`/tickets/${ticket.id}`)
      .send({ priority: 'high' })
      .expect(200);
    expect(raised.body.slaDueAt).not.toBeNull();
    const lowered = await admin.agent
      .patch(`/tickets/${ticket.id}`)
      .send({ priority: 'medium' })
      .expect(200);
    expect(lowered.body.slaDueAt).toBeNull();
  });

  it('rejects empty patches', async () => {
    const { admin } = await team();
    const ticket = await create(admin);
    await admin.agent.patch(`/tickets/${ticket.id}`).send({}).expect(400);
  });
});

describe('tickets: membership changes', () => {
  it('unassigns tickets held by a removed member', async () => {
    const { admin, agent } = await team();
    const ticket = await create(admin, { assigneeId: agent.user.id });
    await admin.agent.delete(`/members/${agent.user.id}`).expect(204);
    const after = await admin.agent.get(`/tickets/${ticket.id}`).expect(200);
    expect(after.body.assigneeId).toBeNull();
  });

  it('unassigns tickets when a member is demoted to viewer, and blocks their writes at once', async () => {
    const { admin, agent } = await team();
    const ticket = await create(agent, { assigneeId: agent.user.id });
    await admin.agent.patch(`/members/${agent.user.id}`).send({ role: 'viewer' }).expect(200);
    await agent.agent.post('/tickets').send({ title: 'as viewer' }).expect(403);
    const after = await admin.agent.get(`/tickets/${ticket.id}`).expect(200);
    expect(after.body.assigneeId).toBeNull();
  });
});

describe('comments', () => {
  it('lets staff comment, records first staff response once, and lists in order', async () => {
    const { admin, agent, viewer } = await team();
    const ticket = await create(admin, { priority: 'urgent' });

    await agent.agent.post(`/tickets/${ticket.id}/comments`).send({ body: 'On it' }).expect(201);
    const first = (await admin.agent.get(`/tickets/${ticket.id}`)).body.firstStaffResponseAt;
    expect(first).not.toBeNull();
    await admin.agent.post(`/tickets/${ticket.id}/comments`).send({ body: 'Thanks' }).expect(201);
    expect((await admin.agent.get(`/tickets/${ticket.id}`)).body.firstStaffResponseAt).toBe(first);

    const list = await viewer.agent.get(`/tickets/${ticket.id}/comments`).expect(200);
    expect(list.body.items.map((c) => [c.body, c.authorRole])).toEqual([
      ['On it', 'agent'],
      ['Thanks', 'admin'],
    ]);
  });

  it('forbids viewers from commenting', async () => {
    const { admin, viewer } = await team();
    const ticket = await create(admin);
    await viewer.agent.post(`/tickets/${ticket.id}/comments`).send({ body: 'hi' }).expect(403);
  });

  it('validates comment bodies strictly', async () => {
    const { admin } = await team();
    const ticket = await create(admin);
    await admin.agent.post(`/tickets/${ticket.id}/comments`).send({ body: '   ' }).expect(400);
    await admin.agent
      .post(`/tickets/${ticket.id}/comments`)
      .send({ body: 'x', authorId: admin.user.id })
      .expect(400);
  });
});

async function orgCtx(who) {
  const me = await who.agent.get('/auth/me').expect(200);
  return { orgId: me.body.org.id, userId: me.body.user.id, role: me.body.user.role };
}
