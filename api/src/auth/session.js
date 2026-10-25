import { authRepo } from '../repositories/auth.repo.js';
import { verifySession } from './tokens.js';

/**
 * Resolve a session token to the live user record. Returns null unless the
 * token is valid AND the user still exists with status=active.
 */
export async function resolveSession(token, config) {
  const payload = verifySession(token, config);
  if (!payload?.sub) return null;
  const user = await authRepo.findActiveUserById(payload.sub);
  if (!user) return null;
  return { user, payload, ctx: toTenantContext(user) };
}

export const toTenantContext = (user) =>
  Object.freeze({ orgId: user.orgId, userId: user._id, role: user.role });
