import { badRequest } from '../errors.js';
import { empty } from '../validation/schemas.js';

const PARTS = ['params', 'query', 'body'];

/**
 * Validate params, query and body with strict Zod schemas. A part without a
 * schema must be empty. Parsed values are exposed as req.valid.{params,query,body}.
 */
export const validate =
  (schemas = {}) =>
  (req, _res, next) => {
    const valid = {};
    const details = [];
    for (const part of PARTS) {
      const result = (schemas[part] ?? empty).safeParse(req[part] ?? {});
      if (result.success) valid[part] = result.data;
      else
        details.push(
          ...result.error.issues.map((i) => ({
            location: part,
            path: i.path.map(String).join('.'),
            message: i.message,
          })),
        );
    }
    if (details.length) return next(badRequest('VALIDATION_ERROR', 'Request is invalid', details));
    req.valid = valid;
    next();
  };
