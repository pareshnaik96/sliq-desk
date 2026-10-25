import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { authenticate } from './middleware/authenticate.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { authRoutes } from './routes/auth.routes.js';
import { healthRoutes } from './routes/health.routes.js';
import { membersRoutes } from './routes/members.routes.js';

export function createApp({ config, logger }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: config.bodyLimit }));
  // One log line per finished request (health probes are skipped to keep logs readable).
  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      if (req.path === '/health') return;
      const ms = Date.now() - started;
      logger.info({ method: req.method, url: req.originalUrl, status: res.statusCode, ms });
    });
    next();
  });

  app.use('/health', healthRoutes());
  app.use('/auth', authRoutes(config));
  app.use('/members', authenticate(config), membersRoutes());

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
