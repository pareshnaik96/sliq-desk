import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGO_URI: z.string().min(1).default('mongodb://localhost:27017/sliqdesk?replicaSet=rs0'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  COOKIE_SECURE: bool.optional(),
  // CORS_ORIGIN (singular) is accepted as an alias.
  CORS_ORIGINS: z.string().optional(),
  CORS_ORIGIN: z.string().optional(),
  BODY_LIMIT: z.string().default('100kb'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  SLA_MINUTES: z.coerce.number().positive().default(60),
  SLA_POLL_SECONDS: z.coerce.number().positive().default(10),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

/**
 * Parse and validate configuration from environment variables.
 * Fails fast on startup if anything is missing or malformed.
 */
export function loadConfig(env = process.env) {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n  ${problems.join('\n  ')}`);
  }
  const e = parsed.data;
  return Object.freeze({
    env: e.NODE_ENV,
    port: e.PORT,
    mongoUri: e.MONGO_URI,
    jwtSecret: e.JWT_SECRET,
    jwtTtlSeconds: e.JWT_TTL_SECONDS,
    // Secure cookies in production unless explicitly overridden (e.g. plain-http localhost demo).
    cookieSecure: e.COOKIE_SECURE ?? e.NODE_ENV === 'production',
    corsOrigins: (e.CORS_ORIGINS ?? e.CORS_ORIGIN ?? 'http://localhost:5173,http://localhost:8080')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    bodyLimit: e.BODY_LIMIT,
    trustProxy: e.TRUST_PROXY,
    authRateLimit: { max: e.AUTH_RATE_LIMIT_MAX, windowMs: e.AUTH_RATE_LIMIT_WINDOW_MS },
    slaMinutes: e.SLA_MINUTES,
    slaPollSeconds: e.SLA_POLL_SECONDS,
    logLevel: e.LOG_LEVEL,
  });
}
