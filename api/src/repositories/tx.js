import mongoose from 'mongoose';

/**
 * Run fn(session) inside a MongoDB transaction. The driver retries the whole
 * callback on transient errors (e.g. write conflicts), so fn must not have
 * side effects outside the database (no event emission inside it).
 */
export async function withTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
