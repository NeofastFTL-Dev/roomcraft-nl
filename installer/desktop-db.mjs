// Desktop bootstrap: ensures the RoomCraft database exists and its schema is
// applied. PostgreSQL only needs to be running; this script creates what is
// missing and is safe to run on every launch.
//
// Run with DATABASE_URL / PGPORT set by the launcher (RoomCraft.exe).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('[db] DATABASE_URL ontbreekt.');
  process.exit(2);
}

const parsed = new URL(connectionString);
const host = parsed.hostname;
const port = Number(parsed.port || 5432);
const user = decodeURIComponent(parsed.username);
const password = decodeURIComponent(parsed.password);
const database = parsed.pathname.replace(/^\//, '') || 'roomcraft';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connect(config, attempts = 40) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const client = new pg.Client(config);
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      try {
        await client.end();
      } catch {
        // connection never opened
      }
      await sleep(500);
    }
  }
  throw lastError;
}

async function main() {
  const base = { host, port, user, password };

  const admin = await connect({ ...base, database: 'postgres' });
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (exists.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${database.replace(/"/g, '""')}"`);
      console.log(`[db] database ${database} aangemaakt`);
    }
  } finally {
    await admin.end();
  }

  const client = await connect({ ...base, database });
  try {
    await client.query(
      'CREATE TABLE IF NOT EXISTS roomcraft_meta (key text PRIMARY KEY, value text NOT NULL)',
    );
    const marker = await client.query("SELECT value FROM roomcraft_meta WHERE key = 'schema'");
    if (marker.rowCount === 0) {
      const schemaPath = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        'prisma',
        'schema.sql',
      );
      const sql = readFileSync(schemaPath, 'utf8');
      await client.query(sql);
      await client.query(
        "INSERT INTO roomcraft_meta (key, value) VALUES ('schema', '1') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      );
      console.log('SCHEMA_CREATED');
    } else {
      console.log('SCHEMA_PRESENT');
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[db] bootstrap mislukt:', error instanceof Error ? error.message : error);
  process.exit(1);
});
