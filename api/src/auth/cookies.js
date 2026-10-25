import { signSession } from './tokens.js';

export const SESSION_COOKIE = 'sliq_session';

const baseOptions = (config) => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: config.cookieSecure,
  path: '/',
});

export function setSessionCookie(res, userId, config) {
  res.cookie(SESSION_COOKIE, signSession(userId, config), {
    ...baseOptions(config),
    maxAge: config.jwtTtlSeconds * 1000,
  });
}

export function clearSessionCookie(res, config) {
  res.clearCookie(SESSION_COOKIE, baseOptions(config));
}

/** Find our cookie in a raw "a=1; b=2" Cookie header (used by HTTP and the socket handshake). */
export function readSessionCookie(cookieHeader = '') {
  for (const pair of cookieHeader.split(';')) {
    const [name, ...value] = pair.trim().split('=');
    if (name === SESSION_COOKIE) return value.join('=');
  }
  return undefined;
}
