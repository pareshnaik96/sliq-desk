import { loadConfig } from './config.js';
import { connectDb, disconnectDb } from './db/connect.js';
import { createLogger } from './logger.js';
import { createServer } from './server.js';

const config = loadConfig();
const logger = createLogger(config);

await connectDb(config.mongoUri, { logger });
const server = createServer({ config, logger });
await server.listen(config.port);
logger.info({ port: config.port }, 'SliqDesk API listening');

const shutdown = async (signal) => {
  logger.info({ signal }, 'Shutting down');
  await server.close();
  await disconnectDb();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
