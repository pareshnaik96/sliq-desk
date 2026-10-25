import { Router } from 'express';
import { pingDb } from '../db/connect.js';

export function healthRoutes() {
  const router = Router();
  router.get('/', async (_req, res) => {
    try {
      await pingDb();
      res.json({ status: 'ok', db: 'up' });
    } catch {
      res.status(503).json({ status: 'degraded', db: 'down' });
    }
  });
  return router;
}
