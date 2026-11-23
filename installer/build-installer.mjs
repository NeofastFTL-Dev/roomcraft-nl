// Builds the single-file Windows installer for RoomCraft NL.
//
//   node installer/build-installer.mjs
//
// Steps: build the web app, stage a portable runtime (app sources, Node.js,
// PostgreSQL binaries, production node_modules), compile the C# launcher,
// zip the staging directory, compile the C# installer and append the zip.
import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const staging = path.join(here, 'staging');
const outDir = path.join(here, 'out');
const appDir = path.join(staging, 'app');
const csc = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
const marker = Buffer.from('RCPAYLOAD1', 'ascii');

// The version comes from package.json so the installer, the payload and the
// Windows uninstall entry all report the same real version.
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = packageJson.version;
if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error('Ongeldige versie in package.json: ' + version);
}
const versionParts = version.split('-')[0].split('.');
const assemblyVersion = versionParts.join('.') + '.0';

const references = [
  'System.dll',
  'System.Core.dll',
  'System.Drawing.dll',
  'System.Windows.Forms.dll',
  'System.IO.Compression.dll',
  'System.IO.Compression.FileSystem.dll',
  'Microsoft.CSharp.dll',
].map((name) => '/r:' + name);

function run(command, args, options = {}) {
  console.log('>', path.basename(command), args.join(' '));
  execFileSync(command, args, { stdio: 'inherit', ...options });
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

async function nodeLicense() {
  const target = path.join(staging, 'node', 'NODE-LICENSE.txt');
  try {
    const response = await fetch('https://raw.githubusercontent.com/nodejs/node/v24.21.0/LICENSE');
    if (!response.ok) throw new Error('status ' + response.status);
    fs.writeFileSync(target, await response.text());
  } catch (error) {
    fs.writeFileSync(
      target,
      'Node.js is distributed under the MIT license.\n' +
        'Full text: https://github.com/nodejs/node/blob/main/LICENSE\n' +
        '(offline build: ' + error.message + ')\n',
    );
  }
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

async function main() {
  console.log('[installer] versie ' + version);
  console.log('[installer] webapp bouwen');
  execSync('npm run build', { cwd: root, stdio: 'inherit' });

  rm(staging);
  rm(outDir);
  fs.mkdirSync(path.join(staging, 'node'), { recursive: true });
  fs.mkdirSync(path.join(staging, 'pgsql'), { recursive: true });
  fs.mkdirSync(appDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  console.log('[installer] app-bestanden kopieren');
  copy(path.join(root, 'dist'), path.join(appDir, 'dist'));
  copy(path.join(root, 'server'), path.join(appDir, 'server'));
  copy(path.join(root, 'shared'), path.join(appDir, 'shared'));
  copy(path.join(root, 'prisma'), path.join(appDir, 'prisma'));
  copy(path.join(root, 'package.json'), path.join(appDir, 'package.json'));
  copy(path.join(root, 'tsconfig.json'), path.join(appDir, 'tsconfig.json'));
  copy(path.join(root, 'tsconfig.server.json'), path.join(appDir, 'tsconfig.server.json'));
  copy(path.join(here, 'desktop-db.mjs'), path.join(appDir, 'desktop-db.mjs'));
  fs.writeFileSync(path.join(appDir, 'prisma', 'schema.sql'), schemaSql());

  console.log('[installer] Node.js-runtime kopieren');
  // process.execPath is the Node that runs this build (the setup-node tool
  // cache on CI, the system Node locally); node.exe is self-contained on Windows.
  copy(process.execPath, path.join(staging, 'node', 'node.exe'));
  await nodeLicense();

  console.log('[installer] PostgreSQL-binaries kopieren');
  const pgNative = path.join(root, 'node_modules', '@embedded-postgres', 'windows-x64', 'native');
  copy(pgNative, path.join(staging, 'pgsql'));
  const pgLicense = path.join(
    root, 'node_modules', '@embedded-postgres', 'windows-x64', 'LICENSE.md');
  if (fs.existsSync(pgLicense)) {
    copy(pgLicense, path.join(staging, 'pgsql', 'POSTGRES-LICENSE.md'));
  }

  console.log('[installer] app-venster (eigen engine) kopieren');
  const electronDist = path.join(root, 'node_modules', 'electron', 'dist');
  const electronDir = path.join(staging, 'electron');
  copy(electronDist, electronDir);
  // The window is RoomCraftWindow.exe: the app carries its own engine, so no
  // browser and no WebView2 runtime is needed on the target machine.
  fs.renameSync(
    path.join(electronDir, 'electron.exe'),
    path.join(electronDir, 'RoomCraftWindow.exe'),
  );
  rm(path.join(electronDir, 'resources', 'default_app.asar'));
  const windowApp = path.join(electronDir, 'resources', 'app');
  fs.mkdirSync(windowApp, { recursive: true });
  copy(path.join(here, 'window', 'main.js'), path.join(windowApp, 'main.js'));
  copy(path.join(here, 'window', 'icon.png'), path.join(windowApp, 'icon.png'));
  const windowPackage = JSON.parse(
    fs.readFileSync(path.join(here, 'window', 'package.json'), 'utf8'));
  windowPackage.version = version;
  fs.writeFileSync(
    path.join(windowApp, 'package.json'),
    JSON.stringify(windowPackage, null, 2) + '\n',
  );
  // Only the interface languages the app uses are kept.
  const locales = path.join(electronDir, 'locales');
  if (fs.existsSync(locales)) {
    for (const name of fs.readdirSync(locales)) {
      if (['nl.pak', 'en-US.pak', 'en-GB.pak'].indexOf(name) === -1) {
        rm(path.join(locales, name));
      }
    }
  }

  console.log('[installer] productie-dependencies installeren');
  const runtimeDeps = [
    '@prisma/adapter-pg',
    '@prisma/client',
    'bcryptjs',
    'cookie-parser',
    'dotenv',
    'express',
    'jsonwebtoken',
    'pg',
    'tsx',
    'zod',
  ];
  const dependencies = {};
  for (const name of runtimeDeps) dependencies[name] = installedVersion(name);
  fs.writeFileSync(
    path.join(staging, 'package.json'),
    JSON.stringify(
      { name: 'roomcraft-desktop', version, private: true, type: 'module', dependencies },
      null,
      2,
    ) + '\n',
  );
  execSync('npm install --omit=dev --no-audit --no-fund --loglevel=error', {
    cwd: staging,
    stdio: 'inherit',
    env: { ...process.env, PRISMA_SKIP_POSTINSTALL_GENERATE: 'true' },
  });
  // Runtime-only payload: the lockfile belongs to the build, not the install.
  rm(path.join(staging, 'package-lock.json'));

  fs.writeFileSync(
    path.join(staging, 'THIRD-PARTY-NOTICES.txt'),
    [
      'RoomCraft NL bundelt de volgende componenten:',
      '',
      '- Node.js (MIT) — node/NODE-LICENSE.txt',
      '- PostgreSQL (PostgreSQL License) — pgsql/POSTGRES-LICENSE.md',
      '- Electron en Chromium (MIT / BSD) — electron/LICENSE, electron/LICENSES.chromium.html',
      '- npm-pakketten — node_modules/ (zie de LICENSE-bestanden per pakket)',
      '',
    ].join('\r\n'),
  );

  console.log('[installer] C# launcher compileren');
  run(csc, [
    '/nologo',
    '/target:winexe',
    '/optimize+',
    '/langversion:5',
    '/out:' + path.join(staging, 'RoomCraft.exe'),
    ...references,
    path.join(here, 'Launcher.cs'),
  ]);

  console.log('[installer] installatiepakket comprimeren');
  const payload = path.join(outDir, 'payload.zip');
  // Windows 10+ ships bsdtar, which can write zip; Git Bash's GNU tar cannot.
  run('C:\\Windows\\System32\\tar.exe', ['-a', '-cf', payload, '-C', staging, '.']);

  console.log('[installer] C# installer compileren');
  const setupExe = path.join(outDir, 'RoomCraftSetup.exe');
  // Pass the real version into the installer assembly (registry + window); the
  // generated source has to live outside staging so it is not installed.
  const versionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roomcraft-version-'));
  const versionSource = path.join(versionDir, 'Version.g.cs');
  fs.writeFileSync(
    versionSource,
    [
      '// Generated from package.json by installer/build-installer.mjs.',
      'using System.Reflection;',
      '[assembly: AssemblyVersion("' + assemblyVersion + '")]',
      '[assembly: AssemblyFileVersion("' + assemblyVersion + '")]',
      '[assembly: AssemblyInformationalVersion("' + version + '")]',
      '',
    ].join('\r\n'),
  );
  try {
    run(csc, [
      '/nologo',
      '/target:winexe',
      '/optimize+',
      '/langversion:5',
      '/out:' + setupExe,
      ...references,
      versionSource,
      path.join(here, 'Setup.cs'),
    ]);
  } finally {
    rm(versionDir);
  }

  console.log('[installer] payload aan installer koppelen');
  const setup = fs.readFileSync(setupExe);
  const archive = fs.readFileSync(payload);
  // Trailer: payload | SHA-256(payload) | marker | int64 length. The installer
  // verifies the digest, so a bit-flipped payload cannot be installed.
  const digest = createHash('sha256').update(archive).digest();
  const length = Buffer.alloc(8);
  length.writeBigInt64LE(BigInt(archive.length));
  const final = path.join(outDir, 'RoomCraft NL Setup.exe');
  fs.writeFileSync(final, Buffer.concat([setup, archive, digest, marker, length]));

  rm(payload);
  // The stub without its payload is not a usable installer.
  rm(setupExe);
  const megabytes = (fs.statSync(final).size / 1024 / 1024).toFixed(1);
  console.log('[installer] klaar: ' + final + ' (' + megabytes + ' MB)');
}

main().catch((error) => {
  console.error('[installer] mislukt:', error.message);
  process.exitCode = 1;
});
