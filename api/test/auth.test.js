import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { Organization } from '../src/models/index.js';
import { authRepo } from '../src/repositories/auth.repo.js';
import { signupOrg, uniqueEmail, useTestApp } from './helpers.js';

const t = useTestApp();

const sessionCookie = (res) =>
  (res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sliq_session='));

describe('auth', () => {
  it('signs up an org with its first admin and sets the session cookie', async () => {
    const email = uniqueEmail();
    const res = await request(t.app)
      .post('/auth/signup')
      .send({ orgName: 'Acme', name: 'Ada', email, password: 'password123' })
      .expect(201);

    expect(res.body.user).toMatchObject({ email, name: 'Ada', role: 'admin', status: 'active' });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.org).toMatchObject({ name: 'Acme', slaMinutes: 30 });
    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Max-Age=900/);
    expect(cookie).not.toMatch(/Secure/); // NODE_ENV=test
  });

  it('marks the cookie Secure when configured for production', async () => {
    const app = createApp({ config: { ...t.config, cookieSecure: true }, logger: t.logger });
    const res = await request(app)
      .post('/auth/signup')
      .send({ orgName: 'Prod', name: 'P', email: uniqueEmail(), password: 'password123' })
      .expect(201);
    expect(sessionCookie(res)).toMatch(/Secure/);
  });

  it('rejects duplicate emails, case-insensitively', async () => {
    const { email } = await signupOrg(t.app);
    const res = await request(t.app)
      .post('/auth/signup')
      .send({ orgName: 'Dup', name: 'D', email: email.toUpperCase(), password: 'password123' })
      .expect(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('rolls back the org when creating the admin fails', async () => {
    const { email } = await signupOrg(t.app, { orgName: 'Original' });
    await expect(
      authRepo.createOrganizationWithAdmin({
        orgName: 'Orphan',
        slaMinutes: 5,
        email,
        name: 'X',
        passwordHash: 'x',
      }),
    ).rejects.toMatchObject({ code: 11000 });
    expect(await Organization.countDocuments({ name: 'Orphan' })).toBe(0);
  });

  it('logs in, reads /auth/me, and logs out', async () => {
    const { email, password } = await signupOrg(t.app, { orgName: 'LoginCo' });
    const agent = request.agent(t.app);
    await agent.get('/auth/me').expect(401);
    await agent.post('/auth/login').send({ email, password }).expect(200);
    const me = await agent.get('/auth/me').expect(200);
    expect(me.body.user.email).toBe(email);
    expect(me.body.org.name).toBe('LoginCo');

    const out = await agent.post('/auth/logout').expect(204);
    expect(sessionCookie(out)).toMatch(/Expires=Thu, 01 Jan 1970/);
    await agent.get('/auth/me').expect(401);
  });

  it('returns the same error for a wrong password and an unknown email', async () => {
    const { email } = await signupOrg(t.app);
    const wrong = await request(t.app)
      .post('/auth/login')
      .send({ email, password: 'nope-nope' })
      .expect(401);
    const unknown = await request(t.app)
      .post('/auth/login')
      .send({ email: uniqueEmail('ghost'), password: 'nope-nope' })
      .expect(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects garbage and foreign-signed tokens', async () => {
    await request(t.app).get('/auth/me').set('Cookie', 'sliq_session=garbage').expect(401);
    const forged = jwt.sign({ sub: 'a'.repeat(24) }, 'some-other-secret-value');
    await request(t.app).get('/auth/me').set('Cookie', `sliq_session=${forged}`).expect(401);
  });

  it('re-issues the cookie once less than half the TTL remains (sliding session)', async () => {
    const { user } = await signupOrg(t.app);
    const fresh = jwt.sign({}, t.config.jwtSecret, { subject: user.id, expiresIn: 900 });
    const aging = jwt.sign({}, t.config.jwtSecret, { subject: user.id, expiresIn: 300 });
    const a = await request(t.app).get('/auth/me').set('Cookie', `sliq_session=${fresh}`);
    expect(sessionCookie(a)).toBeUndefined();
    const b = await request(t.app).get('/auth/me').set('Cookie', `sliq_session=${aging}`);
    expect(sessionCookie(b)).toMatch(/Max-Age=900/);
  });

  it('rejects operator injection and unknown keys (incl. orgId) with 400', async () => {
    const injected = await request(t.app)
      .post('/auth/login')
      .send({ email: { $ne: null }, password: { $ne: null } })
      .expect(400);
    expect(injected.body.error.code).toBe('VALIDATION_ERROR');
    expect(injected.body.error.details.length).toBeGreaterThan(0);

    const extra = await request(t.app)
      .post('/auth/signup')
      .send({
        orgName: 'X',
        name: 'X',
        email: uniqueEmail(),
        password: 'password123',
        orgId: 'a'.repeat(24),
      })
      .expect(400);
    expect(extra.body.error.details[0].message).toMatch(/orgId/);
  });

  it('returns 400 for malformed JSON and 413 for oversized bodies', async () => {
    const bad = await request(t.app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":')
      .expect(400);
    expect(bad.body.error.code).toBe('INVALID_JSON');
    const big = await request(t.app)
      .post('/auth/login')
      .send({ email: 'a@b.co', password: 'x'.repeat(200_000) })
      .expect(413);
    expect(big.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rate limits login attempts', async () => {
    const app = createApp({
      config: { ...t.config, authRateLimit: { max: 3, windowMs: 60_000 } },
      logger: t.logger,
    });
    const attempt = () => request(app).post('/auth/login').send({ email: 'x@y.co', password: 'p' });
    for (let i = 0; i < 3; i++) await attempt().expect(401);
    const res = await attempt().expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});
