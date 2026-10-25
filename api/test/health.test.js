import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers.js';

const t = useTestApp();

describe('health and fallbacks', () => {
  it('reports health and 404s unknown routes with the error shape', async () => {
    await request(t.app).get('/health').expect(200, { status: 'ok', db: 'up' });
    const res = await request(t.app).get('/nope').expect(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  it('sends security headers (helmet)', async () => {
    const res = await request(t.app).get('/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('only allows CORS from configured origins', async () => {
    const ok = await request(t.app).get('/health').set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const evil = await request(t.app).get('/health').set('Origin', 'https://evil.test');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });
});
