import rateLimit from 'express-rate-limit';
import { AppError } from '../errors.js';

export const authRateLimiter = (config) =>
  rateLimit({
    windowMs: config.authRateLimit.windowMs,
    limit: config.authRateLimit.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new AppError(429, 'RATE_LIMITED', 'Too many attempts, please try again later')),
  });
