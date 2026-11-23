// Starts a real PostgreSQL 18 cluster (embedded-postgres binaries) for local
// development. Data persists in ./.pgdata; stop with Ctrl+C.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import path from 'node:path';

const port = Number(process.env.PGPORT ?? 5433);
const dataDir = path.resolve('.pgdata');
const user = 'roomcraft';
const password = 'roomcraft';
const database = 'roomcraft';

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user,
  password,
  port,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C', '--lc-messages=C'],
  onLog: () => {},
  onError: (error) => console.error('[postgres]', error),
});

const alreadyInitialised = existsSync(path.join(dataDir, 'PG_VERSION'));

try {
  if (!alreadyInitialised) {
    console.log('[postgres] initialising cluster in', dataDir);
    await pg.initialise();
  }
  await pg.start();
  console.log(`[postgres] running on 127.0.0.1:${port} (user ${user})`);
  try {
    await pg.createDatabase(database);
    console.log(`[postgres] created database ${database}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already exists/i.test(message)) console.warn('[postgres] createDatabase:', message);
  }
  console.log(`[postgres] DATABASE_URL=postgresql://${user}:${password}@127.0.0.1:${port}/${database}`);
} catch (error) {
  console.error('[postgres] failed to start:', error);
  process.exit(1);
}

let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  console.log('\n[postgres] stopping…');
  try {
    await pg.stop();
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Keep the process (and the child postgres server) alive.
await new Promise(() => {});
