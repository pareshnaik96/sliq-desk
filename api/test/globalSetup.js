import { MongoMemoryReplSet } from 'mongodb-memory-server';

// One single-node replica set for the whole run (transactions need a replica set).
// Each test file uses its own database on it.
export default async function setup(project) {
  const replSet = await MongoMemoryReplSet.create({
    binary: { version: '7.0.14' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  project.provide('mongoUri', replSet.getUri());
  return async () => {
    await replSet.stop();
  };
}
