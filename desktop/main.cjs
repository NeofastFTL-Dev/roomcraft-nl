// RoomCraft NL window host for macOS and Linux.
//
// Electron only owns the window; desktop/launch.mjs (run by the bundled Node)
// starts PostgreSQL and the server, and this process shows ROOMCRAFT_READY in
// a window. Quitting stops the launcher, which stops the server and PostgreSQL.
'use strict';

const { app, BrowserWindow, Menu, dialog } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

app.setName('RoomCraft NL');

const dev = !app.isPackaged;
const resources = dev ? path.join(__dirname, '..') : process.resourcesPath;
const dataDir = dev ? path.join(resources, '.roomcraft-desktop') : app.getPath('userData');
const logFile = path.join(dataDir, 'logs', 'window.log');
const launcherScript = path.join(dev ? __dirname : path.join(resources, 'app', 'desktop'), 'launch.mjs');
let nodeBinary = dev
  ? process.execPath
  : path.join(resources, 'runtime', 'node', 'bin', 'node');

function log(line) {
  const text = `${new Date().toISOString()} ${line}\n`;
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, text);
  } catch {
    /* logging mag het venster nooit stoppen */
  }
  process.stdout.write(line + '\n');
}

let launcher = null;
let window = null;
let quitting = false;
let stopping = false;

function stopLauncher() {
  if (launcher === null || launcher.exitCode !== null || launcher.killed) return;
  launcher.kill('SIGTERM');
  const timer = setTimeout(() => {
    if (launcher !== null && launcher.exitCode === null) launcher.kill('SIGKILL');
  }, 6000);
  timer.unref();
}

function quit() {
  quitting = true;
  app.quit();
}

function createWindow(url) {
  window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 620,
    show: false,
    title: 'RoomCraft NL',
    backgroundColor: '#16130f',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.once('ready-to-show', () => window.show());
  window.webContents.on('did-fail-load', (_event, code, description, failedUrl) => {
    log('Laden mislukt (' + code + ' ' + description + '): ' + failedUrl);
    dialog.showErrorBox(
      'RoomCraft NL',
      'De app kon niet worden geladen. Zie ' + logFile + ' voor details.',
    );
  });
  window.on('closed', () => {
    window = null;
  });

  window.loadURL(url);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [
          {
            label: 'RoomCraft NL',
            submenu: [
              { role: 'about', label: 'Over RoomCraft NL' },
              { type: 'separator' },
              { label: 'Afsluiten', accelerator: 'Command+Q', click: quit },
            ],
          },
        ]
      : []),
    {
      label: 'Bestand',
      submenu: [isMac ? { role: 'close' } : { label: 'Afsluiten', accelerator: 'Alt+F4', click: quit }],
    },
    {
      label: 'Weergave',
      submenu: [
        { label: 'Vernieuwen', accelerator: 'F5', click: () => window && window.reload() },
        { type: 'separator' },
        { role: 'zoomIn', label: 'Inzoomen' },
        { role: 'zoomOut', label: 'Uitzoomen' },
        { role: 'resetZoom', label: 'Normale grootte' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Over RoomCraft NL',
          click: () =>
            dialog.showMessageBox(window, {
              type: 'info',
              title: 'Over RoomCraft NL',
              message: 'RoomCraft NL ' + app.getVersion(),
              detail:
                '2D/3D interieurplanner voor de Nederlandse markt.\n' +
                'Alles wordt lokaal op deze computer opgeslagen.',
              buttons: ['Sluiten'],
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function startLauncher() {
  try {
    fs.chmodSync(nodeBinary, 0o755);
  } catch {
    /* al uitvoerbaar */
  }
  if (!fs.existsSync(nodeBinary)) {
    dialog.showErrorBox('RoomCraft NL', 'De meegeleverde Node.js-runtime ontbreekt: ' + nodeBinary);
    app.quit();
    return;
  }

  log('Launcher starten: ' + nodeBinary);
  launcher = spawn(nodeBinary, [launcherScript], {
    cwd: path.dirname(launcherScript),
    env: {
      ...process.env,
      ROOMCRAFT_DATA: dataDir,
      ROOMCRAFT_RESOURCES: resources,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const launcherLog = fs.createWriteStream(path.join(dataDir, 'logs', 'launcher-stdio.log'), {
    flags: 'a',
  });
  launcher.stderr.pipe(launcherLog);

  const deadline = setTimeout(() => {
    log('Time-out: de server werd niet bereikbaar');
    dialog.showErrorBox(
      'RoomCraft NL',
      'De RoomCraft-server werd niet bereikbaar. Zie ' + logFile + '.',
    );
    quit();
  }, 150000);

  let buffer = '';
  launcher.stdout.on('data', (chunk) => {
    launcherLog.write(chunk);
    buffer += chunk.toString();
    let index;
    while ((index = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line === '') continue;
      log(line);
      if (line.startsWith('ROOMCRAFT_READY ')) {
        clearTimeout(deadline);
        createWindow(line.slice('ROOMCRAFT_READY '.length));
      }
    }
  });

  launcher.on('exit', (code) => {
    clearTimeout(deadline);
    log('Launcher gestopt (' + code + ')');
    if (!quitting && window === null) {
      dialog.showErrorBox(
        'RoomCraft NL',
        'De app kon niet starten (launcher stopte met code ' + code + '). Zie ' + logFile + '.',
      );
      quit();
    }
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (window === null) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });

  app.whenReady().then(() => {
    buildMenu();
    startLauncher();
  });

  app.on('window-all-closed', () => quit());

  // Keep the process alive until the launcher has stopped PostgreSQL and the
  // server, then exit; otherwise they would be orphaned.
  app.on('before-quit', (event) => {
    if (stopping) return;
    stopping = true;
    event.preventDefault();
    const finish = () => app.exit(0);
    if (launcher === null || launcher.exitCode !== null) {
      finish();
      return;
    }
    launcher.once('exit', finish);
    stopLauncher();
    setTimeout(finish, 12000).unref();
  });
}
