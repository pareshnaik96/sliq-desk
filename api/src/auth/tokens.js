import jwt from 'jsonwebtoken';

const ALGORITHM = 'HS256';

/** The token carries only the user id. Role and org are always read from the DB. */
export function signSession(userId, config) {
  return jwt.sign({}, config.jwtSecret, {
    algorithm: ALGORITHM,
    subject: String(userId),
    expiresIn: config.jwtTtlSeconds,
  });
}

/** Returns the decoded payload or null when missing/invalid/expired. */
export function verifySession(token, config) {
  if (!token) return null;
  try {
    return jwt.verify(token, config.jwtSecret, { algorithms: [ALGORITHM] });
  } catch {
    return null;
  }
}
