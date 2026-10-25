import mongoose from 'mongoose';
import { allModels } from '../models/index.js';

mongoose.set('strictQuery', true);

/**
 * Connect to MongoDB, retrying while the replica set comes up (docker compose
 * starts the API before the primary is necessarily elected).
 */
export async function connectDb(uri, { logger, attempts = 30, delayMs = 2000, dbName } = {}) {
  for (let i = 1; ; i++) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, dbName });
      await ensureIndexes();
      return mongoose.connection;
    } catch (err) {
      if (i >= attempts) throw err;
      logger?.warn({ err: err.message, attempt: i }, 'MongoDB not ready, retrying');
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

export async function ensureIndexes() {
  await Promise.all(allModels.map((m) => m.createIndexes()));
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

/** Throws if MongoDB is unreachable (used by GET /health). */
export async function pingDb() {
  await mongoose.connection.db.admin().ping();
}
