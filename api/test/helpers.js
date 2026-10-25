import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, inject } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { createLogger } from '../src/logger.js';

export function testConfig(overrides = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    MONGO_URI: inject('mongoUri'),
    JWT_SECRET: 'test-secret-test-secret',
    LOG_LEVEL: 'silent',
    AUTH_RATE_LIMIT_MAX: '1000',
    SLA_MINUTES: '30',
    ...overrides,
  });
}

/** Connect a fresh database for this test file and build an app against it. */
export function useTestApp(overrides) {
  const state = {};
  beforeAll(async () => {
    state.config = testConfig(overrides);
    state.logger = createLogger(state.config);
    await connectDb(state.config.mongoUri, {
      dbName: `t_${randomUUID().slice(0, 8)}`,
      attempts: 1,
    });
    state.app = createApp(state);
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDb();
  });
  return state;
}

let seq = 0;
export const uniqueEmail = (prefix = 'user') => `${prefix}.${Date.now()}.${++seq}@example.com`;

/** Sign up a new org; returns a cookie-carrying supertest agent for its admin. */
export async function signupOrg(app, { orgName = 'Acme', password = 'password123' } = {}) {
  const agent = request.agent(app);
  const email = uniqueEmail('admin');
  const res = await agent
    .post('/auth/signup')
    .send({ orgName, name: 'Admin', email, password })
    .expect(201);
  return { agent, user: res.body.user, org: res.body.org, email, password, cookie: cookieOf(res) };
}

/** Admin creates a member, then that member logs in; returns their agent. */
export async function addMember(app, adminAgent, role, name = `${role} user`) {
  const email = uniqueEmail(role);
  const res = await adminAgent.post('/members').send({ email, name, role }).expect(201);
  const agent = request.agent(app);
  const login = await agent
    .post('/auth/login')
    .send({ email, password: res.body.temporaryPassword })
    .expect(200);
  return { agent, user: res.body.member, email, cookie: cookieOf(login) };
}

/** "sliq_session=<jwt>" from a response, usable as a Cookie header. */
export const cookieOf = (res) =>
  res.headers['set-cookie'].find((c) => c.startsWith('sliq_session=')).split(';')[0];
