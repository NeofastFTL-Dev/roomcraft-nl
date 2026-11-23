// RoomCraft NL application window.
//
// The launcher (RoomCraft.exe) starts PostgreSQL and the RoomCraft server and
// then starts this program: a real Windows desktop window with its own bundled
// engine, so the app does not need Edge, WebView2 or a browser and works
// offline. This process owns the window, the menu and the tray icon; when it
// exits, the launcher stops the server again.
'use strict';

const { app, BrowserWindow, Menu, Tray, nativeImage, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

function argument(name) {
  const prefix = '--rc-' + name + '=';
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found === undefined ? null : found.slice(prefix.length);
}

const url = argument('url') || 'http://127.0.0.1:41731/';
// The launcher passes the data folder; the default is the install's own data\ so a
// second start of this program talks to the running window's profile and lock.
const dataDir = argument('data') || path.join(path.dirname(process.execPath), '..', 'data');
const logFile = argument('log') || path.join(dataDir, 'logs', 'window.log');
const selfTest = process.argv.includes('--rc-selftest');
// Starting the program with --rc-quit stops a running window through the same
// path as the menu and the tray (quit() below), instead of forcing the process.
const quitRequested = process.argv.includes('--rc-quit');

function log(text) {
  const line = new Date().toISOString().slice(0, 19).replace('T', ' ') + ' ' + text + '\r\n';
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, line);
  } catch {
    /* logging must never stop the window */
  }
  if (selfTest) process.stdout.write(line);
}

// Keep the browser profile with the app data so it survives upgrades and the
// user's folder does not fill up with a second copy.
try {
  app.setPath('userData', path.join(dataDir, 'electron'));
} catch (error) {
  log('Profielmap niet instelbaar: ' + error.message);
}
app.setAppUserModelId('RoomCraft.NL.Desktop');

if (!selfTest && !app.requestSingleInstanceLock()) {
  // The app is already running: --rc-quit is delivered to it (second-instance),
  // any other start brings the running window to the front.
  app.quit();
} else if (quitRequested) {
  // Nothing is running, so there is nothing to stop.
  app.quit();
} else {
  main();
}

function main() {
  let window = null;
  let tray = null;
  let quitting = false;
  let shown = false;

  const iconPath = path.join(__dirname, 'icon.png');
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();

  function show() {
    if (window === null || window.isDestroyed()) return;
    if (!window.isVisible()) window.show();
    if (window.isMinimized()) window.restore();
    window.focus();
  }

  function quit() {
    quitting = true;
    app.quit();
  }

  function buildMenu() {
    const template = [
      {
        label: 'Bestand',
        submenu: [{ label: 'Afsluiten', accelerator: 'Alt+F4', click: quit }],
      },
      {
        label: 'Weergave',
        submenu: [
          { label: 'Vernieuwen', accelerator: 'F5', click: () => window && window.reload() },
          { type: 'separator' },
          { label: 'Inzoomen', accelerator: 'CommandOrControl+=', role: 'zoomIn' },
          { label: 'Uitzoomen', accelerator: 'CommandOrControl+-', role: 'zoomOut' },
          { label: 'Normale grootte', accelerator: 'CommandOrControl+0', role: 'resetZoom' },
        ],
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'Over RoomCraft NL',
            click: () => {
              dialog.showMessageBox(window, {
                type: 'info',
                title: 'Over RoomCraft NL',
                message: 'RoomCraft NL ' + app.getVersion(),
                detail:
                  '2D/3D interieurplanner voor Nederlandse meubelwinkels.\n' +
                  'Alles wordt lokaal op deze computer opgeslagen.',
                buttons: ['Sluiten'],
              });
            },
          },
        ],
      },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }

  function createWindow(visible) {
    window = new BrowserWindow({
      width: 1180,
      height: 780,
      minWidth: 900,
      minHeight: 620,
      show: false,
      title: 'RoomCraft NL',
      backgroundColor: '#16130f',
      icon: icon.isEmpty() ? undefined : icon,
      autoHideMenuBar: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
        devTools: !selfTest && process.env.ROOMCRAFT_DEVTOOLS === '1',
      },
    });

    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    window.once('ready-to-show', () => {
      if (visible) window.show();
    });

    // did-finish-load fires before React has mounted its screens; wait until the
    // real interface is on screen so the launcher and the self-test do not treat
    // the empty shell as a loaded app.
    async function waitForInterface() {
      const deadline = Date.now() + 30000;
      let last = { title: '', nodes: 0 };
      while (Date.now() < deadline) {
        try {
          const probe = await window.webContents.executeJavaScript(
            'JSON.stringify({ title: document.title, nodes: document.querySelectorAll("#root *").length })',
          );
          last = JSON.parse(probe);
          if ((last.nodes || 0) > 20) return last;
        } catch (error) {
          log('UI niet uitleesbaar: ' + error.message);
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return last;
    }

    window.webContents.on('did-finish-load', async () => {
      shown = true;
      const result = await waitForInterface();
      const content = result.nodes || 0;
      log('UI geladen: ' + (result.title || '(geen titel)') + ' (' + content + ' elementen)');
      if (selfTest) {
        // The self-test only needs proof that the interface really rendered.
        app.exit(content > 20 ? 0 : 1);
      }
    });

    window.webContents.on('did-fail-load', (event, code, description, failedUrl) => {
      log('Laden mislukt (' + code + ' ' + description + '): ' + failedUrl);
      if (selfTest) {
        app.exit(2);
        return;
      }
      dialog.showMessageBox(window, {
        type: 'error',
        title: 'RoomCraft NL',
        message: 'De app kon niet worden geladen.',
        detail: 'De RoomCraft-server is niet bereikbaar. Zie ' + logFile + '.',
        buttons: ['Sluiten'],
      });
    });

    window.webContents.on('render-process-gone', (event, details) => {
      log('Weergaveproces gestopt: ' + details.reason);
      if (selfTest) app.exit(3);
    });

    // Closing the window keeps the app in the tray, as before. Afsluiten in the
    // tray or in the menu stops everything.
    window.on('close', (event) => {
      if (quitting) return;
      event.preventDefault();
      window.hide();
      if (tray !== null) {
        tray.displayBalloon({
          title: 'RoomCraft NL draait nog',
          content: 'Klik het pictogram om terug te keren. Kies Afsluiten om te stoppen.',
        });
      }
    });

    window.on('closed', () => {
      window = null;
    });

    window.loadURL(url);
    if (selfTest) {
      setTimeout(() => {
        log('Self-test time-out');
        app.exit(4);
      }, 30000);
    }
  }

  function createTray() {
    if (icon.isEmpty()) return;
    tray = new Tray(icon.resize({ width: 16, height: 16 }));
    tray.setToolTip('RoomCraft NL');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Openen', click: show },
        { type: 'separator' },
        { label: 'Afsluiten', click: quit },
      ]),
    );
    tray.on('double-click', show);
  }

  app.on('second-instance', (event, argv) => {
    if (argv.indexOf('--rc-quit') !== -1) quit();
    else show();
  });

  app.whenReady().then(() => {
    if (!selfTest) {
      buildMenu();
      createTray();
    }
    createWindow(!selfTest);
  });

  app.on('window-all-closed', () => {
    // The app lives in the tray until the user chooses Afsluiten.
    if (selfTest) app.quit();
  });

  app.on('before-quit', () => {
    quitting = true;
    if (tray !== null) {
      tray.destroy();
      tray = null;
    }
  });
}
