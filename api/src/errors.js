/**
 * Application error carrying an HTTP status and a stable machine-readable code.
 * Serialized by the error handler as { error: { code, message, details? } }.
 */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code, message, details) => new AppError(400, code, message, details);
export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'You do not have permission to perform this action') =>
  new AppError(403, 'FORBIDDEN', message);
export const notFound = (resource = 'Resource') =>
  new AppError(404, 'NOT_FOUND', `${resource} not found`);
export const conflict = (code, message) => new AppError(409, code, message);
export const unprocessable = (code, message, details) => new AppError(422, code, message, details);
