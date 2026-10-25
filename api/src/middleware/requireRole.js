import { forbidden, unauthorized } from '../errors.js';

/** Coarse role gate; fine-grained checks use can() from src/policies. */
export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.ctx) return next(unauthorized());
    if (!roles.includes(req.ctx.role)) return next(forbidden());
    next();
  };
