// Picks the storage backend at boot: Postgres when DATABASE_URL is present,
// otherwise a zero-setup in-memory + JSON-file store for local dev.
import { createMemoryStore } from './memory.js';
import { createPostgresStore } from './postgres.js';

export async function createStore() {
  const threshold = Number(process.env.VOTE_THRESHOLD || 10);
  const connectionString = process.env.DATABASE_URL;

  const store = connectionString
    ? createPostgresStore({ threshold, connectionString })
    : createMemoryStore({ threshold });

  await store.init();
  console.log(
    `[store] using ${connectionString ? 'postgres' : 'memory (data/store.json)'}, vote threshold = ${threshold}`
  );
  return store;
}
