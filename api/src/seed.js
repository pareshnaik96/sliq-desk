// Entry point: `node src/seed.js` (run by the api container before the server).
import { loadConfig } from './config.js';
import { connectDb, disconnectDb } from './db/connect.js';
import { seedIfEmpty } from './db/seed.js';
import { createLogger } from './logger.js';

const config = loadConfig();
const logger = createLogger(config);

await connectDb(config.mongoUri, { logger });
try {
  await seedIfEmpty({ config, logger });
} finally {
  await disconnectDb();
}
