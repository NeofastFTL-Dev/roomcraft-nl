// Desktop launcher for RoomCraft NL on macOS and Linux.
//
// It starts the bundled PostgreSQL cluster, creates the database and schema,
// loads the demo catalogue on first run and starts the RoomCraft server. The
// Electron host (desktop/main.cjs) waits for ROOMCRAFT_READY and opens the
// window on that URL. `--check` runs the same path headless, queries
// /api/health and exits, which is what the autobuild uses as a smoke test.
import EmbeddedPostgres from 'embedded-postgres';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.ROOMCRAFT_DATA
  ? path.resolve(process.env.ROOMCRAFT_DATA)
  : path.join(appDir, 'data');
const logDir = path.join(dataDir, 'logs');
const pgDataDir = path.join(dataDir, 'pgdata');
const checkOnly = process.argv.includes('--check');
const tsxCli = path.join(appDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');

if (!fs.existsSync(tsxCli)) {
  console.error('[launcher] tsx ontbreekt: ' + tsxCli);
  process.exit(2);
}

fs.mkdirSync(logDir, { recursive: true });

function log(line) {
  const text = `${new Date().toISOString()} ${line}\n`;
  try {
    fs.appendFileSync(path.join(logDir, 'launcher.log'), text);
  } catch {
    /* loggen mag het starten nooit stoppen */
  }
  process.stdout.write(line + '\n');
}

/** First free port on 127.0.0.1 at or above `start`. */
function freePort(start) {
  return new Promise((resolve, reject) => {
    const attempt = (port) => {
      if (port > start + 200) {
        reject(new Error('Geen vrije poort gevonden vanaf ' + start));
        return;
      }
      const server = net.createServer();
      server.unref();
      server.once('error', (error) => {
        if (error.code === 'EADDRINUSE' || error.code === 'EACCES') attempt(port + 1);
        else reject(error);
      });
      server.listen(port, '127.0.0.1', () => {
        const address = server.address();
        server.close(() => resolve(address.port));
      });
    };
    attempt(start);
  });
}

function readOrCreateSecret() {
  const file = path.join(dataDir, 'roomcraft.env');
  if (fs.existsSync(file)) {
    const match = fs.readFileSync(file, 'utf8').match(/^JWT_SECRET=(.+)$/m);
    if (match) return match[1].trim();
  }
  const secret = randomBytes(32).toString('hex');
  fs.writeFileSync(file, 'JWT_SECRET=' + secret + '\n', { mode: 0o600 });
  return secret;
}

/** Creates the database and applies prisma/schema.sql when it is still empty. */
async function bootstrapDatabase(connectionString) {
  const parsed = new URL(connectionString);
  const base = {
    host: parsed.hostname,
    port: Number(parsed.port || 5432),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
  };

  const admin = new pg.Client({ ...base, database: 'postgres' });
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      'roomcraft',
    ]);
    if (exists.rowCount === 0) {
      await admin.query('CREATE DATABASE "roomcraft"');
      log('[launcher] database roomcraft aangemaakt');
    }
  } finally {
    await admin.end();
  }

  const client = new pg.Client({ ...base, database: 'roomcraft' });
  await client.connect();
  try {
    await client.query(
      'CREATE TABLE IF NOT EXISTS roomcraft_meta (key text PRIMARY KEY, value text NOT NULL)',
    );
    const marker = await client.query("SELECT value FROM roomcraft_meta WHERE key = 'schema'");
    if (marker.rowCount > 0) return false;
    const sql = fs.readFileSync(path.join(appDir, 'prisma', 'schema.sql'), 'utf8');
    await client.query(sql);
    await client.query(
      "INSERT INTO roomcraft_meta (key, value) VALUES ('schema', '1') " +
        'ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    );
    log('[launcher] schema aangemaakt');
    return true;
  } finally {
    await client.end();
  }
}

function seedCatalog(connectionString) {
  log('[launcher] demo-catalogus laden');
  const result = spawnSync(process.execPath, [tsxCli, 'prisma/seed.ts'], {
    cwd: appDir,
    env: { ...process.env, DATABASE_URL: connectionString },
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error('Seed mislukt (exit ' + result.status + ')');
  }
}

async function waitForHealth(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'timeout';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url + 'api/health');
      if (response.ok) return;
      lastError = 'HTTP ' + response.status;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Server niet bereikbaar: ' + lastError);
}

let postgres = null;
let server = null;
let stopping = false;

async function shutdown(code) {
  if (stopping) return;
  stopping = true;
  if (server !== null && server.exitCode === null && !server.killed) {
    server.kill('SIGTERM');
    const timer = setTimeout(() => {
      if (server.exitCode === null) server.kill('SIGKILL');
    }, 5000);
    timer.unref();
  }
  if (postgres !== null) {
    try {
      await postgres.stop();
    } catch (error) {
      log('[launcher] PostgreSQL stoppen mislukt: ' + error);
    }
  }
  log('[launcher] gestopt');
  process.exit(code);
}

process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));
process.on('uncaughtException', (error) => {
  log('[launcher] fout: ' + (error instanceof Error ? error.stack : error));
  void shutdown(1);
});
process.on('unhandledRejection', (error) => {
  log('[launcher] fout: ' + error);
  void shutdown(1);
});

async function main() {
  const pgPort = await freePort(55432);
  const webPort = await freePort(41731);

  log('[launcher] gegevens in ' + dataDir);
  postgres = new EmbeddedPostgres({
    databaseDir: pgDataDir,
    user: 'roomcraft',
    password: 'roomcraft',
    port: pgPort,
    persistent: true,
    // The packaged runtime copies the binaries instead of running the npm
    // install script, so recreate the library symlinks on first start.
    autoRehydrateSymlinks: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C', '--lc-messages=C'],
    onLog: () => {},
    onError: (error) => log('[postgres] ' + error),
  });

  if (!fs.existsSync(path.join(pgDataDir, 'PG_VERSION'))) {
    log('[launcher] PostgreSQL-cluster initialiseren');
    await postgres.initialise();
  }
  await postgres.start();
  log('[launcher] PostgreSQL op 127.0.0.1:' + pgPort);

  try {
    await postgres.createDatabase('roomcraft');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already exists/i.test(message)) throw error;
  }

  const databaseUrl =
    'postgresql://roomcraft:roomcraft@127.0.0.1:' + pgPort + '/roomcraft?schema=public';
  const created = await bootstrapDatabase(databaseUrl);
  if (created) seedCatalog(databaseUrl);

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(webPort),
    CLIENT_ORIGIN: 'http://127.0.0.1:' + webPort,
    DATABASE_URL: databaseUrl,
    JWT_SECRET: readOrCreateSecret(),
    COOKIE_SECURE: 'false',
    DESKTOP_MODE: '1',
    PGPORT: String(pgPort),
  };

  const serverLog = fs.createWriteStream(path.join(logDir, 'server.log'), { flags: 'a' });
  server = spawn(process.execPath, [tsxCli, 'server/index.ts'], {
    cwd: appDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.pipe(serverLog);
  server.stderr.pipe(serverLog);
  server.on('exit', (code, signal) => {
    if (stopping) return;
    log('[launcher] server gestopt (' + (code ?? signal) + ')');
    void shutdown(code ?? 1);
  });

  const url = 'http://127.0.0.1:' + webPort + '/';
  await waitForHealth(url, 120000);
  log('ROOMCRAFT_READY ' + url);

  if (checkOnly) {
    const response = await fetch(url + 'api/health');
    log('[launcher] health ' + (await response.text()));
    await shutdown(0);
    return;
  }

  // Keep the process (and therefore PostgreSQL and the server) alive.
  await new Promise(() => {});
}

main().catch((error) => {
  log('[launcher] starten mislukt: ' + (error instanceof Error ? error.message : error));
  void shutdown(1);
});
