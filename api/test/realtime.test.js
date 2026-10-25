import { io as connect } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from '../src/server.js';
import { addMember, signupOrg, useTestApp } from './helpers.js';

const t = useTestApp();
let server;
let url;
const sockets = [];

beforeAll(async () => {
  server = createServer({ config: t.config, logger: t.logger, startWorker: false });
  t.app = server.httpServer; // drive HTTP through the same server
  const http = await server.listen(0);
  url = `http://127.0.0.1:${http.address().port}`;
});
afterAll(() => server.close());
afterEach(() => sockets.splice(0).forEach((s) => s.close()));

function open(cookie, opts = {}) {
  const socket = connect(url, {
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: cookie ? { cookie } : {},
    ...opts,
  });
  sockets.push(socket);
  return socket;
}

const connected = (socket) =>
  new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });

const next = (socket, event, ms = 2000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${event} within ${ms}ms`)), ms);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

/** Collect every occurrence of an event for a short window. */
const collect = (socket, event, ms = 300) =>
  new Promise((resolve) => {
    const seen = [];
    socket.on(event, (p) => seen.push(p));
    setTimeout(() => resolve(seen), ms);
  });

describe('realtime', () => {
  it('rejects handshakes without a valid session cookie', async () => {
    await expect(connected(open())).rejects.toThrow('UNAUTHENTICATED');
    await expect(connected(open('sliq_session=forged'))).rejects.toThrow('UNAUTHENTICATED');
  });

  it('rejects handshakes from origins outside the allowlist', async () => {
    const a = await signupOrg(t.app);
    const socket = open(a.cookie, {
      extraHeaders: { cookie: a.cookie, origin: 'https://evil.test' },
    });
    await expect(connected(socket)).rejects.toThrow();
  });

  it("delivers events only to the actor's org room", async () => {
    const a = await signupOrg(t.app);
    const b = await signupOrg(t.app);
    const sa = open(a.cookie);
    const sb = open(b.cookie);
    await Promise.all([connected(sa), connected(sb)]);

    // A client cannot pick rooms: there is no join handler, so this is ignored.
    sb.emit('join', `org:${a.org.id}`);

    const leaked = collect(sb, 'ticket.created');
    const created = next(sa, 'ticket.created');
    const res = await a.agent.post('/tickets').send({ title: 'Live' }).expect(201);
    expect(await created).toEqual({ ticketId: res.body.id, number: 1 });
    expect(await leaked).toEqual([]);
  });

  it('emits ticket.updated with changed fields and comment.created', async () => {
    const a = await signupOrg(t.app);
    const s = open(a.cookie);
    await connected(s);
    const ticket = (await a.agent.post('/tickets').send({ title: 'x' })).body;

    const updated = next(s, 'ticket.updated');
    await a.agent.patch(`/tickets/${ticket.id}`).send({ status: 'in_progress' }).expect(200);
    const payload = await updated;
    expect(payload).toMatchObject({ ticketId: ticket.id, changes: { status: 'in_progress' } });
    expect(Object.keys(payload.changes).sort()).toEqual(['status', 'updatedAt']);

    const commented = next(s, 'comment.created');
    const c = await a.agent.post(`/tickets/${ticket.id}/comments`).send({ body: 'hi' });
    expect(await commented).toEqual({
      ticketId: ticket.id,
      commentId: c.body.id,
      authorId: a.user.id,
    });
  });

  it('does not emit when the write fails', async () => {
    const a = await signupOrg(t.app);
    const s = open(a.cookie);
    await connected(s);
    const ticket = (await a.agent.post('/tickets').send({ title: 'x' })).body;
    await a.agent.patch(`/tickets/${ticket.id}`).send({ status: 'closed' }).expect(200);

    const events = collect(s, 'ticket.updated');
    await a.agent.patch(`/tickets/${ticket.id}`).send({ status: 'open' }).expect(422);
    expect(await events).toEqual([]);
  });

  it('disconnects a member on removal and on role change, and notifies the org', async () => {
    const admin = await signupOrg(t.app);
    const m1 = await addMember(t.app, admin.agent, 'agent');
    const m2 = await addMember(t.app, admin.agent, 'agent');
    const sAdmin = open(admin.cookie);
    const s1 = open(m1.cookie);
    const s2 = open(m2.cookie);
    await Promise.all([connected(sAdmin), connected(s1), connected(s2)]);

    const changed = next(sAdmin, 'member.changed');
    const dropped = next(s1, 'disconnect');
    await admin.agent.delete(`/members/${m1.user.id}`).expect(204);
    expect(await changed).toEqual({ memberId: m1.user.id, change: 'removed' });
    expect(await dropped).toBe('io server disconnect');
    // Reconnecting with the old cookie fails: the user is no longer active.
    await expect(connected(open(m1.cookie))).rejects.toThrow('UNAUTHENTICATED');

    const dropped2 = next(s2, 'disconnect');
    await admin.agent.patch(`/members/${m2.user.id}`).send({ role: 'viewer' }).expect(200);
    expect(await dropped2).toBe('io server disconnect');
    await connected(open(m2.cookie)); // still active, may reconnect with the new role
    expect(sAdmin.connected).toBe(true);
  });

  it('pushes ticket.overdue from the SLA worker to the right org', async () => {
    const a = await signupOrg(t.app);
    const b = await signupOrg(t.app);
    const sa = open(a.cookie);
    const sb = open(b.cookie);
    await Promise.all([connected(sa), connected(sb)]);
    const ticket = (await a.agent.post('/tickets').send({ title: 'x', priority: 'urgent' })).body;

    const overdue = next(sa, 'ticket.overdue');
    const leaked = collect(sb, 'ticket.overdue');
    // Run the worker as if the SLA window has elapsed.
    await server.worker.tick(new Date(Date.now() + 31 * 60_000));
    expect(await overdue).toMatchObject({ ticketId: ticket.id, number: 1, priority: 'urgent' });
    expect(await leaked).toEqual([]);
  });
});
