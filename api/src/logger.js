import pino from 'pino';

export function createLogger(config) {
  return pino({
    level: config.logLevel,
    // Defence in depth: never print secrets even if an object containing them is logged.
    redact: ['*.password', '*.passwordHash', '*.cookie'],
  });
}
