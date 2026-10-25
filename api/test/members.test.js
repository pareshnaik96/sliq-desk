import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { addMember, signupOrg, uniqueEmail, useTestApp } from './helpers.js';

const t = useTestApp();

describe('members', () => {
  it('lets an admin add a member and returns the temporary password once', async () => {
    const { agent } = await signupOrg(t.app);
    const email = uniqueEmail('new');
    const res = await agent
      .post('/members')
      .send({ email, name: 'New Agent', role: 'agent' })
      .expect(201);
    expect(res.body.member).toMatchObject({ email, role: 'agent', status: 'active' });
    expect(res.body.temporaryPassword).toMatch(/^[\w-]{16}$/);

    const list = await agent.get('/members').expect(200);
    const listed = list.body.items.find((m) => m.email === email);
    expect(listed).toBeDefined();
    expect(JSON.stringify(list.body)).not.toMatch(/temporaryPassword|passwordHash/);

    await request(t.app)
      .post('/auth/login')
      .send({ email, password: res.body.temporaryPassword })
      .expect(200);
  });

  it('rejects member management by agents and viewers', async () => {
    const admin = await signupOrg(t.app);
    const agentUser = await addMember(t.app, admin.agent, 'agent');
    const viewerUser = await addMember(t.app, admin.agent, 'viewer');
    for (const { agent } of [agentUser, viewerUser]) {
      await agent.get('/members').expect(200); // everyone can see the team
      await agent
        .post('/members')
        .send({ email: uniqueEmail(), name: 'X', role: 'agent' })
        .expect(403);
      await agent.patch(`/members/${admin.user.id}`).send({ role: 'viewer' }).expect(403);
      await agent.delete(`/members/${admin.user.id}`).expect(403);
    }
  });

  it('rejects duplicate emails across orgs', async () => {
    const a = await signupOrg(t.app);
    const b = await signupOrg(t.app);
    const res = await b.agent
      .post('/members')
      .send({ email: a.email, name: 'Dup', role: 'agent' })
      .expect(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('applies role changes immediately to existing sessions', async () => {
    const admin = await signupOrg(t.app);
    const second = await addMember(t.app, admin.agent, 'admin');
    const newMember = () => ({ email: uniqueEmail(), name: 'X', role: 'viewer' });
    await second.agent.post('/members').send(newMember()).expect(201);

    await admin.agent.patch(`/members/${second.user.id}`).send({ role: 'agent' }).expect(200);
    // Same cookie, but the role is read from the DB on every request.
    await second.agent.post('/members').send(newMember()).expect(403);
    const me = await second.agent.get('/auth/me').expect(200);
    expect(me.body.user.role).toBe('agent');
  });

  it('revokes access immediately when a member is removed', async () => {
    const admin = await signupOrg(t.app);
    const member = await addMember(t.app, admin.agent, 'agent');
    await member.agent.get('/members').expect(200);

    await admin.agent.delete(`/members/${member.user.id}`).expect(204);
    await member.agent.get('/members').expect(401);
    await member.agent.get('/auth/me').expect(401);
    await request(t.app)
      .post('/auth/login')
      .send({ email: member.email, password: 'whatever1' })
      .expect(401);
    const list = await admin.agent.get('/members').expect(200);
    expect(list.body.items.map((m) => m.id)).not.toContain(member.user.id);
    // Removing again is a 404.
    await admin.agent.delete(`/members/${member.user.id}`).expect(404);
  });

  it('protects the last active admin from demotion and removal', async () => {
    const admin = await signupOrg(t.app);
    const demote = await admin.agent
      .patch(`/members/${admin.user.id}`)
      .send({ role: 'agent' })
      .expect(409);
    expect(demote.body.error.code).toBe('LAST_ADMIN');
    await admin.agent.delete(`/members/${admin.user.id}`).expect(409);

    // With a second admin, demoting the first is allowed.
    const second = await addMember(t.app, admin.agent, 'admin');
    await second.agent.patch(`/members/${admin.user.id}`).send({ role: 'agent' }).expect(200);
    await second.agent.delete(`/members/${second.user.id}`).expect(409);
  });

  it('never lets two concurrent demotions remove the last admin', async () => {
    const a = await signupOrg(t.app);
    const b = await addMember(t.app, a.agent, 'admin');
    const results = await Promise.all([
      a.agent.patch(`/members/${b.user.id}`).send({ role: 'agent' }),
      b.agent.patch(`/members/${a.user.id}`).send({ role: 'agent' }),
    ]);
    // Exactly one wins; the loser sees LAST_ADMIN (or 403 if already demoted).
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const winner = results[0].status === 200 ? a : b;
    const list = await winner.agent.get('/members').expect(200);
    expect(list.body.items.filter((m) => m.role === 'admin')).toHaveLength(1);
  });

  it('returns 404 for members of another org and 400 for malformed ids', async () => {
    const a = await signupOrg(t.app);
    const b = await signupOrg(t.app);
    const bMember = await addMember(t.app, b.agent, 'agent');
    await a.agent.patch(`/members/${bMember.user.id}`).send({ role: 'viewer' }).expect(404);
    await a.agent.delete(`/members/${bMember.user.id}`).expect(404);
    await a.agent.patch('/members/not-an-id').send({ role: 'viewer' }).expect(400);
    const me = await bMember.agent.get('/auth/me').expect(200);
    expect(me.body.user.role).toBe('agent');
  });
});
