import { clearSessionCookie, readSessionCookie, setSessionCookie } from '../auth/cookies.js';
import { resolveSession } from '../auth/session.js';
import { unauthorized } from '../errors.js';

/**
 * Loads the user from the database on every request and builds req.ctx
 * (the TenantContext). Role and org come from the DB record, never the token,
 * so role changes and removals take effect immediately.
 *
 * Sliding session: once less than half the TTL remains, a fresh token is issued.
 */
export const authenticate = (config) => async (req, res, next) => {
  const session = await resolveSession(readSessionCookie(req.headers.cookie), config);
  if (!session) {
    clearSessionCookie(res, config);
    return next(unauthorized());
  }
  req.user = session.user;
  req.ctx = session.ctx;

  const remaining = session.payload.exp - Math.floor(Date.now() / 1000);
  if (remaining < config.jwtTtlSeconds / 2) setSessionCookie(res, session.user._id, config);
  next();
};
