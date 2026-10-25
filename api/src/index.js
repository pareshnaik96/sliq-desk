import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { connectDb, disconnectDb } from './db/connect.js';
import { createLogger } from './logger.js';

const config = loadConfig();
const logger = createLogger(config);

await connectDb(config.mongoUri, { logger });
const httpServer = createServer(createApp({ config, logger }));
httpServer.listen(config.port, () => logger.info({ port: config.port }, 'SliqDesk API listening'));

const shutdown = async (signal) => {
  logger.info({ signal }, 'Shutting down');
  httpServer.close();
  await disconnectDb();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
