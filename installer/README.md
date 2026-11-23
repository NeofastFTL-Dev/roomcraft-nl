# RoomCraft NL — Windows installer

`RoomCraft NL Setup.exe` is a self-contained Windows installer (C#, .NET
Framework 4.8) that installs the whole application per user: no Node.js, npm or
PostgreSQL needs to be present on the target machine.

## Build

```bash
cd roomcraft-nl
npm install
node installer/build-installer.mjs
```

Output: `installer/out/RoomCraft NL Setup.exe` (~1 file, no external runtime).
`npm install` also fetches the engine for the app window; the build copies it
from `node_modules/electron/dist`, so the result still needs nothing on the
target machine.

The version comes from `package.json`. The build stamps it into the installer
assembly, and the installer uses it for the Windows uninstall entry
(`DisplayVersion`) and for the version shown in its window. Bumping
`package.json` and rebuilding is therefore all an upgrade needs to report the
new version.

The build stages a portable runtime and compiles two C# programs with the
compiler that ships with Windows:

| File | Purpose |
| --- | --- |
| `Setup.cs` | Windowed installer; extracts the appended zip payload, writes shortcuts and the uninstall entry |
| `Launcher.cs` | `RoomCraft.exe`: starts PostgreSQL + the Node server, opens the app window and stops everything again when it closes; also `--uninstall` and `--selftest` |
| `window/main.js` | The app window itself: its own Windows window, menu and tray icon, driven by the engine bundled in `electron\` (no browser, no WebView2) |
| `desktop-db.mjs` | Creates the `roomcraft` database and applies `prisma/schema.sql` on first launch |
| `build-installer.mjs` | Produces the payload and appends it to the installer |

## Installed layout

```
%LOCALAPPDATA%\Programs\RoomCraft NL\
├─ RoomCraft.exe            launcher/supervisor (also the uninstall entry point)
├─ roomcraft.env            generated JWT secret
├─ app\                     built client, server/shared sources, Prisma schema, seed
├─ electron\                the app window with its own engine
│  ├─ RoomCraftWindow.exe   window program
│  └─ resources\app\        window code, icon and version
├─ node\node.exe            bundled Node.js 24 runtime
├─ pgsql\                   bundled PostgreSQL 18 server binaries
├─ node_modules\            production dependencies (Express, Prisma, pg, tsx, …)
└─ data\                    created on first run: PostgreSQL cluster, logs, ports,
                             and the window profile (data\electron)
```

The app has no accounts: `RoomCraft.exe` sets `DESKTOP_MODE=1`, and the server
then serves a single local user (`Lokale gebruiker`) without sessions. Login and
registration return `403` in that mode, so the app opens straight into the
dashboard.

The window is a real Windows program with its own engine: the build stages
Electron from `node_modules/electron/dist` (a dev dependency, fetched by
`npm install`) as `electron\RoomCraftWindow.exe` and puts its code, icon and
version in `electron\resources\app`. Nothing has to be installed on the target
machine — no Edge, no WebView2 runtime, no browser — and the app works offline.
The launcher starts the window once the server answers, keeps running while the
window is open, and stops PostgreSQL and the server when the window quits. The
window has its own menu (Afsluiten, zoom, Over) and a tray icon; closing it keeps
the app in the tray, `Afsluiten` stops it. Only the Dutch and English interface
languages of the engine are kept, and its profile lives in `data\electron`.

The launcher picks free local ports (starting at 55432 for PostgreSQL and 41731
for HTTP), stores them in `data\ports.txt`, and binds both to `127.0.0.1` only.
`COOKIE_SECURE=false` is set for this local HTTP deployment; the default remains
HTTPS-only in production deployments.

## Upgrading

Run a newer `RoomCraft NL Setup.exe` over the same install directory. The
installer first unpacks the complete payload into a staging folder next to the
installation and verifies its SHA-256 digest. Only then does it stop
a running `RoomCraft.exe` together with the bundled PostgreSQL cluster, move the
previous `app\`, `node\`, `pgsql\`, `node_modules\` and launcher into a backup
folder beside the installation, and move the staged files into place. Nothing
from an earlier build lingers, and locked binaries cannot abort the copy.

If placing the staged files fails after this point, the files that were already
moved in are removed and the previous program files are moved back from the
backup, so an interrupted upgrade leaves the old version working instead of a
partial installation. The backup folder (`.roomcraft-previous-*`) is deleted
after a successful upgrade; only if the restore itself fails does it stay behind,
and the error message names it. `data\` and `roomcraft.env` are never moved.

`Setup.cs` contains the rollback fault used by the verification
(`#if ROLLBACK_TEST`); the compiler only includes it when that symbol is passed,
so the shipped installer has no test switch.

A truncated or corrupt `Setup.exe` therefore fails before anything installed is
removed: the existing installation keeps working and an error message names the
problem. Silent runs exit with code 1 and write
`%TEMP%\roomcraft-setup-error.log`. The appended payload is protected by a
SHA-256 digest in the installer trailer, checked while it is read; this matters
because the zip reader does not verify entry CRCs, so a single flipped byte could
otherwise unpack silently as a damaged binary.

`data\` (database, logs, `ports.txt`, `seeded.txt`) and the JWT secret in
`roomcraft.env` are kept, so projects and existing sessions survive. The Start
Menu folder is recreated with exactly one shortcut; a desktop shortcut is created
only when the box is ticked, and an existing one is overwritten rather than added.

## Usage

```
RoomCraft.exe              start the app (window + tray icon)
RoomCraft.exe --selftest   start, check page + local user + projects, stop
electron\RoomCraftWindow.exe --rc-quit
                           stop the running window (same path as tray → Afsluiten);
                           the launcher then stops PostgreSQL and the server
RoomCraft.exe --uninstall              remove shortcuts, registry entry and program files
RoomCraft.exe --uninstall /S           silent uninstall, keeps data\
RoomCraft.exe --uninstall /S /PURGEDATA  silent uninstall that also deletes data\
```

Silent install (used by the build verification):

```
"RoomCraft NL Setup.exe" /S "/D=C:\path\to\install"
```

Uninstall deletes the program files with a detached `cmd` after the launcher
exits. The user's projects are kept by default: the windowed uninstall asks
(default *Nee*), and a silent uninstall keeps `data\` and `roomcraft.env` unless
`/PURGEDATA` (or `--purge-data`) is passed. What stays behind is the install
directory containing `data\` and a short `Gegevens-bewaard.txt`; installing into
that same directory again resumes the saved projects. With `/PURGEDATA` the
folder is removed completely.
