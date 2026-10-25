/** Error carrying the API's { error: { code, message, details } } payload. */
export class ApiError extends Error {
  constructor(status, { code, message, details } = {}) {
    super(message ?? `Request failed (${status})`);
    this.status = status;
    this.code = code ?? 'UNKNOWN';
    this.details = details;
  }
}

/** Invoked on any 401 so the app can drop back to the login screen. */
let onUnauthenticated = () => {};
export const setUnauthenticatedHandler = (fn) => {
  onUnauthenticated = fn;
};

export async function api(path, { method = 'GET', body, query } = {}) {
  const params = new URLSearchParams(
    Object.entries(query ?? {}).filter(([, v]) => v != null && v !== ''),
  ).toString();
  const res = await fetch(`/api${path}${params ? `?${params}` : ''}`, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // /auth/me reports "signed out" through its own query; login 401s are just bad credentials.
    if (res.status === 401 && path !== '/auth/login' && path !== '/auth/me') onUnauthenticated();
    throw new ApiError(res.status, data.error);
  }
  return data;
}
