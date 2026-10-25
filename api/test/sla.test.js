import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bus, EVENTS } from '../src/events/bus.js';
import { createSlaWorker } from '../src/jobs/sla.worker.js';
import { Ticket } from '../src/models/index.js';
import { signupOrg, useTestApp } from './helpers.js';

const t = useTestApp();

let events;
let off;
beforeEach(async () => {
  await Ticket.deleteMany({});
  events = [];
  off = bus.onOrgEvent((e) => e.type === EVENTS.TICKET_OVERDUE && events.push(e));
});
afterEach(() => off());

const worker = () => createSlaWorker({ pollSeconds: 10 });
const later = () => new Date(Date.now() + 31 * 60_000); // past the 30-minute test SLA

const create = (who, body) =>
  who.agent
    .post('/tickets')
    .send({ title: 'x', ...body })
    .expect(201)
    .then((r) => r.body);

describe('SLA worker', () => {
  it('flags breached high/urgent tickets exactly once', async () => {
    const a = await signupOrg(t.app);
    const urgent = await create(a, { priority: 'urgent' });
    await create(a, { priority: 'low' });
    await create(a, { priority: 'medium' });

    const w = worker();
    expect(await w.tick(new Date())).toBe(0); // not due yet
    const now = later();
    expect(await w.tick(now)).toBe(1);
    expect(await w.tick(now)).toBe(0); // no duplicate alert

    const stored = await Ticket.findById(urgent.id).lean();
    expect(stored).toMatchObject({ overdue: true, overdueAt: now });
    expect(events).toEqual([
      {
        orgId: a.org.id,
        type: 'ticket.overdue',
        payload: expect.objectContaining({ ticketId: urgent.id, number: urgent.number }),
      },
    ]);
  });

  it('skips tickets with a staff response or that are resolved/closed', async () => {
    const a = await signupOrg(t.app);
    const answered = await create(a, { priority: 'high' });
    await a.agent.post(`/tickets/${answered.id}/comments`).send({ body: 'on it' }).expect(201);
    const resolved = await create(a, { priority: 'high' });
    await a.agent.patch(`/tickets/${resolved.id}`).send({ status: 'resolved' }).expect(200);
    const closed = await create(a, { priority: 'urgent' });
    await a.agent.patch(`/tickets/${closed.id}`).send({ status: 'closed' }).expect(200);

    expect(await worker().tick(later())).toBe(0);
    expect(events).toEqual([]);
  });

  it('is safe with several instances running concurrently (no duplicates)', async () => {
    const a = await signupOrg(t.app);
    const b = await signupOrg(t.app);
    for (let i = 0; i < 10; i++) {
      await create(a, { priority: 'urgent' });
      await create(b, { priority: 'high' });
    }
    const now = later();
    const counts = await Promise.all([worker(), worker(), worker()].map((w) => w.tick(now)));
    expect(counts.reduce((x, y) => x + y, 0)).toBe(20);
    const ids = events.map((e) => e.payload.ticketId);
    expect(new Set(ids).size).toBe(20);
    expect(events.filter((e) => e.orgId === a.org.id)).toHaveLength(10);
  });

  it('survives restarts because the deadline lives in MongoDB', async () => {
    const a = await signupOrg(t.app);
    await create(a, { priority: 'urgent' });
    // A brand-new worker (fresh process state) still finds the due ticket.
    expect(await worker().tick(later())).toBe(1);
  });

  it('uses the partial SLA index for the claim query', async () => {
    const plan = await Ticket.find({
      slaDueAt: { $lte: new Date() },
      overdue: false,
      firstStaffResponseAt: null,
      status: { $in: ['open', 'in_progress'] },
    })
      .sort({ slaDueAt: 1 })
      .explain('queryPlanner');
    expect(JSON.stringify(plan)).toMatch(/slaDueAt_1/);
  });
});
