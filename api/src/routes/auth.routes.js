import { Router } from 'express';
import { clearSessionCookie, setSessionCookie } from '../auth/cookies.js';
import { authenticate } from '../middleware/authenticate.js';
import { authRateLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import * as authService from '../services/auth.service.js';
import { loginBody, signupBody } from '../validation/schemas.js';

export function authRoutes(config) {
  const router = Router();
  const limiter = authRateLimiter(config);

  router.post('/signup', limiter, validate({ body: signupBody }), async (req, res) => {
    const { userId, ...result } = await authService.signup(req.valid.body, config);
    setSessionCookie(res, userId, config);
    res.status(201).json(result);
  });

  router.post('/login', limiter, validate({ body: loginBody }), async (req, res) => {
    const { userId, ...result } = await authService.login(req.valid.body);
    setSessionCookie(res, userId, config);
    res.json(result);
  });

  router.post('/logout', (_req, res) => {
    clearSessionCookie(res, config);
    res.status(204).end();
  });

  router.get('/me', authenticate(config), validate(), async (req, res) => {
    res.json(await authService.me(req.ctx, req.user));
  });

  return router;
}
