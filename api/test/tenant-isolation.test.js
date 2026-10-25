import { beforeAll, describe, expect, it } from 'vitest';
import { addMember, signupOrg, useTestApp } from './helpers.js';

const t = useTestApp();

// Org A gets real data; org B's users try to reach it by id on every endpoint.
let a;
let b;
let ids;

beforeAll(async () => {
  a = await signupOrg(t.app, { orgName: 'Org A' });
  const aAgent = await addMember(t.app, a.agent, 'agent');
  const ticket = (await a.agent.post('/tickets').send({ title: 'A secret', priority: 'urgent' }))
    .body;
  const comment = (await a.agent.post(`/tickets/${ticket.id}/comments`).send({ body: 'A only' }))
    .body;
  ids = { ticket: ticket.id, comment: comment.id, member: aAgent.user.id, admin: a.user.id };

  b = await signupOrg(t.app, { orgName: 'Org B' });
  b.viewer = await addMember(t.app, b.agent, 'viewer');
  b.agentUser = await addMember(t.app, b.agent, 'agent');
});

describe("tenant isolation: org B cannot reach org A's ids", () => {
  const cases = [
    ['GET', () => `/tickets/${ids.ticket}`],
    ['PATCH', () => `/tickets/${ids.ticket}`, { status: 'closed' }],
    ['PATCH', () => `/tickets/${ids.ticket}`, { title: 'pwned' }],
    ['GET', () => `/tickets/${ids.ticket}/comments`],
    ['POST', () => `/tickets/${ids.ticket}/comments`, { body: 'hi' }],
    ['PATCH', () => `/members/${ids.member}`, { role: 'viewer' }],
    ['DELETE', () => `/members/${ids.member}`],
    ['PATCH', () => `/members/${ids.admin}`, { role: 'agent' }],
    ['DELETE', () => `/members/${ids.admin}`],
  ];

  for (const [method, path, body] of cases)
    it(`${method} ${path.toString().match(/`(.*)`/)[1]} -> 404 for org B admin`, async () => {
      const req = b.agent[method.toLowerCase()](path());
      const res = await (body ? req.send(body) : req);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

  it('treats a comment id as unknown when used as a ticket id', async () => {
    await b.agent.get(`/tickets/${ids.comment}`).expect(404);
  });

  it("returns 404 (not 403) to B's agent and viewer on A's ticket", async () => {
    await b.agentUser.agent.patch(`/tickets/${ids.ticket}`).send({ status: 'closed' }).expect(404);
    await b.viewer.agent.get(`/tickets/${ids.ticket}`).expect(404);
    await b.viewer.agent.get(`/tickets/${ids.ticket}/comments`).expect(404);
  });

  it("left org A's data untouched", async () => {
    const ticket = (await a.agent.get(`/tickets/${ids.ticket}`).expect(200)).body;
    expect(ticket).toMatchObject({ status: 'open', title: 'A secret' });
    const comments = (await a.agent.get(`/tickets/${ids.ticket}/comments`).expect(200)).body;
    expect(comments.items.map((c) => c.body)).toEqual(['A only']);
    const members = (await a.agent.get('/members').expect(200)).body.items;
    expect(members.map((m) => m.id)).toEqual(expect.arrayContaining([ids.member, ids.admin]));
  });
});

describe('tenant isolation: list endpoints only return own-org data', () => {
  it('GET /tickets with every filter combination', async () => {
    for (const q of ['', '?status=open', '?priority=urgent', '?assignee=unassigned', '?limit=100'])
      expect((await b.agent.get(`/tickets${q}`).expect(200)).body.items).toEqual([]);
    const res = await b.agent.get(`/tickets?assignee=${ids.member}`).expect(200);
    expect(res.body.items).toEqual([]);
  });

  it('GET /members', async () => {
    const items = (await b.agent.get('/members').expect(200)).body.items;
    expect(items.map((m) => m.email).sort()).toEqual(
      [b.email, b.viewer.email, b.agentUser.email].sort(),
    );
  });

  it("cannot assign A's members to B's tickets", async () => {
    const ticket = (await b.agent.post('/tickets').send({ title: 'B' })).body;
    const res = await b.agent
      .patch(`/tickets/${ticket.id}`)
      .send({ assigneeId: ids.member })
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_ASSIGNEE');
  });

  it('ignores a client-supplied orgId everywhere it might be smuggled', async () => {
    const orgId = a.org.id;
    await b.agent.post('/tickets').send({ title: 'x', orgId }).expect(400);
    await b.agent.get(`/tickets?orgId=${orgId}`).expect(400);
    await b.agent
      .post('/members')
      .send({ email: 'x@y.co', name: 'x', role: 'agent', orgId })
      .expect(400);
  });
});
