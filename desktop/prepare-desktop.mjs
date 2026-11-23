// Stages the portable runtime used by the macOS and Linux packages.
//
//   node desktop/prepare-desktop.mjs
//
// It builds the web app, generates the Prisma client, copies the server and
// schema into desktop/staging/app, installs the production dependencies there
// (including embedded-postgres for this platform) and downloads the Node.js
// runtime for the build machine. electron-builder then wraps desktop/main.cjs
// plus desktop/staging/app and runtime/ into the platform package.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const staging = path.join(here, 'staging');
const appDir = path.join(staging, 'app');
const runtimeDir = path.join(root, 'runtime');
const nodeDir = path.join(runtimeDir, 'node');

const NODE_VERSION = '24.21.0';
const platform = process.platform;
const arch = process.arch;
if (platform !== 'darwin' && platform !== 'linux') {
  throw new Error('Deze build is alleen voor macOS en Linux, niet voor ' + platform);
}
if (arch !== 'arm64' && arch !== 'x64') {
  throw new Error('Onbekende architectuur: ' + arch);
}
const nodeTarget = platform + '-' + arch;

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = packageJson.version;

function run(command, args, options = {}) {
  console.log('>', path.basename(command), args.join(' '));
  execSync([command, ...args].join(' '), { cwd: root, stdio: 'inherit', ...options });
}

function rm(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function copy(source, destination) {
  if (!fs.existsSync(source)) throw new Error('Ontbrekend bestand: ' + source);
  fs.cpSync(source, destination, { recursive: true });
}

function installedVersion(name) {
  const manifest = path.join(root, 'node_modules', name, 'package.json');
  return JSON.parse(fs.readFileSync(manifest, 'utf8')).version;
}

function schemaSql() {
  const migrations = path.join(root, 'prisma', 'migrations');
  const files = fs
    .readdirSync(migrations)
    .filter((name) => fs.statSync(path.join(migrations, name)).isDirectory())
    .sort()
    .map((name) => path.join(migrations, name, 'migration.sql'))
    .filter((file) => fs.existsSync(file));
  if (files.length === 0) throw new Error('Geen Prisma-migraties gevonden.');
  return files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
}

async function downloadNode() {
  const archiveName = `node-v${NODE_VERSION}-${nodeTarget}.tar.gz`;
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${archiveName}`;
  console.log('[desktop] Node.js downloaden:', url);
  const response = await fetch(url);
  if (!response.ok) throw new Error('Node.js download mislukt: HTTP ' + response.status);

  rm(runtimeDir);
  fs.mkdirSync(runtimeDir, { recursive: true });
  const archive = path.join(runtimeDir, archiveName);
  fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()));

  const extractDir = path.join(runtimeDir, 'extract');
  fs.mkdirSync(extractDir, { recursive: true });
  execSync(`tar -xzf "${archive}" -C "${extractDir}"`, { stdio: 'inherit' });
  const extracted = path.join(extractDir, `node-v${NODE_VERSION}-${nodeTarget}`);
  fs.renameSync(extracted, nodeDir);
  rm(extractDir);
  rm(archive);
  fs.chmodSync(path.join(nodeDir, 'bin', 'node'), 0o755);

  try {
    const license = await fetch(
      `https://raw.githubusercontent.com/nodejs/node/v${NODE_VERSION}/LICENSE`,
    );
    fs.writeFileSync(
      path.join(nodeDir, 'NODE-LICENSE.txt'),
      license.ok ? await license.text() : 'Node.js is MIT-licensed.\n',
    );
  } catch {
    fs.writeFileSync(path.join(nodeDir, 'NODE-LICENSE.txt'), 'Node.js is MIT-licensed.\n');
  }
}

async function main() {
  console.log(`[desktop] RoomCraft NL ${version} voor ${nodeTarget}`);

  // The typecheck inside `npm run build` needs the generated Prisma client.
  run('npx', ['prisma', 'generate'], {
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://roomcraft:roomcraft@127.0.0.1:5432/roomcraft?schema=public',
    },
  });
  run('npm', ['run', 'build']);

  rm(staging);
  fs.mkdirSync(appDir, { recursive: true });
  copy(path.join(root, 'dist'), path.join(appDir, 'dist'));
  copy(path.join(root, 'server'), path.join(appDir, 'server'));
  copy(path.join(root, 'shared'), path.join(appDir, 'shared'));
  copy(path.join(root, 'prisma'), path.join(appDir, 'prisma'));
  copy(path.join(root, 'tsconfig.json'), path.join(appDir, 'tsconfig.json'));
  copy(path.join(root, 'tsconfig.server.json'), path.join(appDir, 'tsconfig.server.json'));
  fs.mkdirSync(path.join(appDir, 'desktop'), { recursive: true });
  copy(path.join(here, 'launch.mjs'), path.join(appDir, 'desktop', 'launch.mjs'));
  fs.writeFileSync(path.join(appDir, 'prisma', 'schema.sql'), schemaSql());

  const runtimeDeps = [
    '@prisma/adapter-pg',
    '@prisma/client',
    'bcryptjs',
    'cookie-parser',
    'dotenv',
    'embedded-postgres',
    'express',
    'jsonwebtoken',
    'pg',
    'tsx',
    'zod',
  ];
  const dependencies = {};
  for (const name of runtimeDeps) dependencies[name] = installedVersion(name);
  fs.writeFileSync(
    path.join(appDir, 'package.json'),
    JSON.stringify(
      { name: 'roomcraft-desktop', version, private: true, type: 'module', dependencies },
      null,
      2,
    ) + '\n',
  );

  console.log('[desktop] productie-dependencies installeren');
  execSync('npm install --omit=dev --no-audit --no-fund --loglevel=error', {
    cwd: appDir,
    stdio: 'inherit',
    env: { ...process.env, PRISMA_SKIP_POSTINSTALL_GENERATE: 'true' },
  });
  rm(path.join(appDir, 'package-lock.json'));

  fs.writeFileSync(
    path.join(appDir, 'THIRD-PARTY-NOTICES.txt'),
    [
      'RoomCraft NL bundelt de volgende componenten:',
      '',
      '- Node.js (MIT) — runtime/node/NODE-LICENSE.txt',
      '- PostgreSQL (PostgreSQL License) — node_modules/@embedded-postgres/',
      '- Electron en Chromium (MIT / BSD) — Electron-appbundel',
      '- npm-pakketten — node_modules/ (zie de LICENSE-bestanden per pakket)',
      '',
    ].join('\n'),
  );

  await downloadNode();

  const nodeSize = (fs.statSync(path.join(nodeDir, 'bin', 'node')).size / 1024 / 1024).toFixed(1);
  console.log('[desktop] Node.js ' + NODE_VERSION + ' (' + nodeSize + ' MB binary) klaar');
  console.log('[desktop] staging klaar: ' + appDir);
}

main().catch((error) => {
  console.error('[desktop] mislukt:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
