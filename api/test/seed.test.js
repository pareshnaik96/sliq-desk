import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { SEED_PASSWORD, seedIfEmpty } from '../src/db/seed.js';
import { Organization, Ticket, User } from '../src/models/index.js';
import { useTestApp } from './helpers.js';

const t = useTestApp();

describe('seed', () => {
  it('seeds two orgs with admin/agent/viewer and varied tickets, exactly once', async () => {
    const first = await seedIfEmpty({ config: t.config });
    expect(first.seeded).toBe(true);
    expect(await Organization.countDocuments()).toBe(2);
    expect(await User.countDocuments()).toBe(6);

    const again = await seedIfEmpty({ config: t.config });
    expect(again.seeded).toBe(false);
    expect(await User.countDocuments()).toBe(6);
    expect(await Ticket.countDocuments()).toBe(10);
  });

  it('produces working logins scoped to their own org', async () => {
    const agent = request.agent(t.app);
    const me = await agent
      .post('/auth/login')
      .send({ email: 'agent@acme.test', password: SEED_PASSWORD })
      .expect(200);
    expect(me.body.user.role).toBe('agent');

    const { items } = (await agent.get('/tickets').expect(200)).body;
    expect(items).toHaveLength(5);
    expect(new Set(items.map((i) => i.status))).toEqual(
      new Set(['open', 'in_progress', 'resolved', 'closed']),
    );
    expect(items.some((i) => i.assigneeId === me.body.user.id)).toBe(true);
    expect(items.filter((i) => i.assigneeId === null).length).toBeGreaterThanOrEqual(1);
    const urgent = items.find((i) => i.priority === 'urgent');
    expect(urgent.slaDueAt).not.toBeNull();
    expect(urgent.firstStaffResponseAt).toBeNull();

    for (const role of ['admin', 'viewer'])
      await request(t.app)
        .post('/auth/login')
        .send({ email: `${role}@globex.test`, password: SEED_PASSWORD })
        .expect(200);
  });
});
