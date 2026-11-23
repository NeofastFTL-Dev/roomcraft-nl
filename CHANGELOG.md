# Changelog

All notable changes to RoomCraft NL are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), semantic versioning.

## [1.0.0] — 2026-11-20

First complete, runnable build of RoomCraft NL.

### Added

* **Accounts & sessions** — registration, login, logout, bcrypt hashing, JWT in an
  httpOnly SameSite=Lax cookie, login rate limiting, origin checks on mutations.
* **Projects** — create, list, open, rename, describe, duplicate, delete; owner
  scoping on every query; named versions with restore; dashboard thumbnails.
* **Room model** — walls with real thickness/height, exterior loop with validation,
  doors and windows as wall intervals, partition walls, ceiling height, grid snap.
* **2D editor (Konva)** — metre-based stage, grid, pan/wheel zoom, fit-to-room,
  furniture drag with snapping, rotation handle, shift multi-select, keyboard
  nudge, measure tool, door swing arcs, wall selection.
* **3D editor (React Three Fiber)** — extruded walls with real openings, floor
  polygon, optional ceiling, procedural furniture for every category, GLB loading
  with error-boundary fallback, translate/rotate gizmo, camera reset, orbit zoom,
  selection synchronised with the 2D plan and inspector.
* **Catalog** — 33 labelled demo products with realistic dimensions and prices,
  category/search/retailer/style filtering, retailer status with honest
  `not_configured` state and a feed sync endpoint.
* **Decoration studio** — 7 floor finishes, 8 wall finishes, ceiling colour,
  per-item colour swatches and 12 material presets.
* **Fit checker** — wall collisions, furniture overlap (rug-aware, vertical-range
  aware), door swing blocking, door-route warnings, window obstruction, ceiling
  collisions, floating items, missing products, budget overflow.
* **Budget manager** — quantity aggregation, category breakdown, limit with
  remaining/over-budget, order list, CSV export.
* **AI design assistant** — deterministic planner with three proposals, ghost
  preview, explicit approval, undoable application, budget trimming.
* **Export** — plan PNG, 3D PNG, design JSON, budget CSV.
* **Import** — restore an exported design JSON in the project panel. The file is
  validated with `designDocSchema` (clear error for invalid documents) and
  placements referencing unknown product IDs are rejected with a message naming
  them, so nothing is imported as a broken/empty item. The import is undoable and
  the 2D view refits afterwards, so a differently sized room is not off-screen.
* **Testing** — 26 Vitest domain tests, 2 Playwright end-to-end flows, full
  TypeScript typecheck of shared/server/client, production build.
* **Docs** — BUILD_PLAN, PROJECT_STATUS, README, this changelog.

### Fixed

* Plan PNG export now composites the Konva stage: Konva draws each layer into a
  separate canvas, so exporting one canvas only captured the grid.
* Toolbar icon buttons have accessible names (`Ongedaan maken`, `Opnieuw`,
  `Terug naar dashboard`, `Uitloggen`), which also make them reliably testable.
* Shadow-map warning removed by using `THREE.PCFShadowMap` explicitly.
* Retailer filter lists every connector, including `— niet gekoppeld`, so the
  integration state is visible instead of silently hidden.
* `PORT=""` no longer makes the API listen on port 0.
* Playwright can run against an installed browser (`PLAYWRIGHT_CHANNEL=chrome`)
  when the bundled-browser CDN is unreachable; e2e runs clean up their projects.

### Changed

* **Windows-installer (C#)** — `installer/build-installer.mjs` produces a single
  `RoomCraft NL Setup.exe` (~108 MB) that bundles Node.js 24, PostgreSQL 18, the
  built client and production dependencies. The C# installer extracts the
  appended payload, writes shortcuts and an uninstall entry; the C# launcher
  starts PostgreSQL and the server on free loopback ports, opens the browser and
  can uninstall. `RoomCraft.exe --selftest` verifies a fresh install end to end
  (page, demo login, project list).
* **Upgrade safety** — the installer now unpacks and verifies the payload into a
  staging folder next to the installation before it stops and deletes the
  previous `app\`, `node\`, `pgsql\`, `node_modules\` and launcher. A truncated
  or corrupt `Setup.exe` fails with a clear error and leaves the working
  installation untouched instead of deleting it first. The old program files are
  moved to a backup beside the installation rather than deleted, and if placing
  the new ones fails they are removed and the old ones moved back, so an
  interrupted upgrade restores the previous version instead of leaving a partial
  installation. The payload carries a
  SHA-256 digest that is verified while it is read, so a flipped byte is rejected
  rather than silently unpacking into a damaged binary (the zip reader does not
  check entry CRCs).
* **Installer-upgrade** — installing over an existing installation now stops the
  running launcher (with its Node child) and the bundled PostgreSQL cluster, then
  deletes `app\`, `node\`, `pgsql\`, `node_modules\` and the launcher before
  extracting. Files removed from a later build no longer linger, and locked
  binaries cannot abort the copy. `data\` and the JWT secret in `roomcraft.env`
  are kept, so projects and sessions survive; the Start Menu folder is recreated
  with exactly one shortcut. The build also removes the payload-less
  `RoomCraftSetup.exe` stub, which was not a usable installer on its own.
* **Desktop app** — `RoomCraft.exe` now opens RoomCraft in its own program window
  instead of in the default browser, and the desktop build has no accounts: the
  launcher sets `DESKTOP_MODE=1`, the server serves one local user without
  sessions, login/registration return `403`, and the UI opens straight into the
  dashboard with no login/register screens or logout button.
* **Own engine, no WebView2** — the window is `electron\RoomCraftWindow.exe`, a
  real Windows program carrying its own engine (Electron/Chromium, staged from
  `node_modules/electron/dist`), so the machine needs no Edge, no WebView2 runtime
  and no browser, and the app works offline. The window has a native menu
  (Afsluiten, zoom, Over) and a tray icon; closing it keeps the app in the tray
  and `Afsluiten` stops the server and PostgreSQL. Its profile lives in
  `data\electron`, only the Dutch and English engine languages are shipped, and
  `electron\` is treated as a program folder: stopped before an upgrade, replaced
  by it and removed on uninstall. Upgrading an installation of the previous
  WebView2 build deletes its three DLLs and the old `data\webview` profile.
  Starting the window program again with `--rc-quit` stops a running window
  through the same path as the menu and tray, so that quit can be verified.
* **Installer cleanup** — the upgrade path no longer has dead branches: staged
  moves assume the previous entries were moved aside (a colliding file now fails
  and rolls back instead of being deleted), the backup folder is always created
  before anything moves, `taskkill`/`pg_ctl` are trusted to wait for their
  processes (no fixed sleeps), and the build always uses Windows' `tar.exe` for
  the payload. `data\` and `roomcraft.env` are not part of any move or delete.
* **Installer version** — the installer no longer hardcodes `1.0.0`. The build
  reads `package.json`, stamps the version into the installer assembly and uses
  it for `DisplayVersion` in the uninstall entry and for the version shown in the
  installer window, so the Windows Apps list follows every upgrade.
* **Uninstall keeps user data** — `RoomCraft.exe --uninstall` no longer deletes
  `data\` by default. The windowed uninstall asks and defaults to *Nee*; a
  silent uninstall (`/S`) always keeps the database and JWT secret, leaving a
  `Gegevens-bewaard.txt` pointer in `data\` and the install directory in place so
  a reinstall into it resumes the projects. Deleting everything now requires
  `/PURGEDATA` (or `--purge-data`).
* **`COOKIE_SECURE`** — an explicit opt-out for local HTTP deployments; the
  default remains HTTPS-only cookies in production.
* **Design import validation without zod in the browser** — the project panel no
  longer imports `designDocSchema`, so the ~84 kB zod runtime is out of the
  client bundle (1,783.06 kB → 1,699.04 kB, gzip 500.65 kB → 476.41 kB).
  `shared/designValidation.ts` mirrors the schema with plain TypeScript, keeps
  the same `pad: melding` error format and 5-issue cap, strips unknown keys like
  zod does, and is covered by parity tests against `designDocSchema`. The server
  still validates every design with zod before writing it.

### Security

* Security headers, `x-powered-by` disabled, Zod validation and payload limits,
  design product-id verification, password hashes never serialised.
* Verified against the running API: a fresh account cannot read another user's
  project (`404`), its list only contains its own project, and `/api/auth/me`
  returns `null` without a session.

### Known limitations

* No live retailer feeds: adapters require a signed agreement and feed credentials.
* No licensed GLB furniture is bundled; procedural meshes are used as fallback.
* No PDF export, single room per project, no collaboration.
