import { AppError } from '../errors.js';

const send = (res, status, code, message, details) =>
  res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });

export const notFoundHandler = (_req, res) => send(res, 404, 'NOT_FOUND', 'Route not found');

export const errorHandler = (logger) => (err, _req, res, _next) => {
  if (err instanceof AppError) return send(res, err.status, err.code, err.message, err.details);
  if (err?.type === 'entity.parse.failed') return send(res, 400, 'INVALID_JSON', 'Malformed JSON');
  if (err?.type === 'entity.too.large')
    return send(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
  if (err?.code === 11000) return send(res, 409, 'CONFLICT', 'Resource already exists');
  if (Number.isInteger(err?.status) && err.status >= 400 && err.status < 500)
    return send(res, err.status, 'BAD_REQUEST', 'Bad request');

  logger.error({ err }, 'Unhandled error');
  send(res, 500, 'INTERNAL', 'Something went wrong');
};
