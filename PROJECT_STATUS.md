# RoomCraft NL — Project status

Last updated: 2026-11-20 · version 1.0.0

## Environment used for verification

| Item | Value |
| --- | --- |
| OS | Windows 11 (win32) |
| Node.js | 24.21.0 |
| Package manager | npm 11.19.0 |
| Database | PostgreSQL 18.7 (embedded-postgres binaries, port 5433, data in `.pgdata`) |
| API | Express 5 on `127.0.0.1:4000` |
| Client | Vite 8 on `localhost:5173` |
| Browser for manual check | Chromium (packaged) |
| Browser for Playwright | locally installed Google Chrome (`PLAYWRIGHT_CHANNEL=chrome`) because the Playwright CDN download was blocked |

Demo account: `demo@roomcraft.nl` / `Roomcraft123!`.

## Verification results

| Check | Command | Result |
| --- | --- | --- |
| Shared domain tests | `npx vitest run` | **42/42 passed** (6 files: geometry, fit, budget, planner, importDesign, designValidation) |
| TypeScript (3 projects) | `npm run typecheck` | **passed**, 0 errors |
| Production build | `npm run build` | **passed** — `dist/index.html` 0.62 kB, CSS 20.64 kB, JS 1,699 kB (gzip 476 kB; import validation no longer pulls zod into the browser bundle, saving 84 kB / 24 kB gzip) |
| End-to-end | `PLAYWRIGHT_CHANNEL=chrome npx playwright test` | **3/3 passed** (editor flow, JSON round-trip, AI approval flow) |
| Database migration | `npx prisma migrate dev --name init` | applied `20261120154817_init` |
| Seed | `npm run db:seed` | 33 demo products, demo user, 2 sample projects |
| API health | `GET /api/health` | `{"status":"ok","database":"up"}` |
| Auth | `POST /api/auth/login`, `GET /api/projects` | session cookie issued; 2 owned projects returned |
| Catalog | `GET /api/catalog`, `GET /api/retailers` | 33 demo products; demo showroom online, 5 retailers `not_configured` |
| AI proposals | `POST /api/ai/suggest` | `roomcraft-rule-based-v1`, 3 proposals, €1614 / €1327 / €1614, **0 blocking errors** |
| 2D canvas renders | pixel sampling in the browser | 29 unique colours in a 60×40 sample |
| 3D canvas renders | pixel sampling in the browser | 152 unique colours, shadowed geometry visible |
| Browser console | after login → project → editor | no errors (one three.js shadow-map deprecation warning was fixed by pinning `PCFShadowMap`) |
| Registration + isolation | live API: register, create project, read foreign project | `201`, `201`, **`404 Project niet gevonden.`**; own list has 1 project; anonymous `/api/auth/me` → `{"user":null}` |
| Combined dev script | `npm run dev` | Vite 8.3.8 ready on `localhost:5173`, API on `127.0.0.1:4000`, `/api/health` `database: up` |
| Installer-upgrade | install → project aanmaken → opnieuw installeren terwijl de app draait | **PASS** — 24/24 checks: `data\`, pgdata, poorten, seed-marker en JWT-secret behouden; project en ontwerp ongewijzigd na herstart; één Start Menu- en één bureaublad-snelkoppeling; oude `app\`/`node\`-bestanden weg; installatie byte-identiek aan de build |
| Windows-installer | silent install + `RoomCraft.exe --selftest` + `--uninstall` | **PASS** — 107.7 MB single exe, installed 301 MB; self-test: page served, demo login 200, projects 200; uninstall removed files, shortcut and registry key |
| Upgrade-veiligheid | installatie + project → afgekapte en gecorrumpeerde Setup.exe → echte upgrade | **PASS** — 24/24 checks (18 upgrade + 6 corrupt): afgekapte én bit-flipped Setup.exe worden door de SHA-256-controle geweigerd (exit 1), app-bestanden en project blijven intact, `--selftest` groen, geen staging-rest; daarna vervangt de echte upgrade alle oude bestanden, behoudt data/poorten/secret, één snelkoppeling en het project met 3 items |
| Afsluiten-pad | draaiende app → `electron\RoomCraftWindow.exe --rc-quit` (zelfde `quit()` als menu en tray) | **PASS** — 15/15: venster sluit, launcher exit **0** en logt `Venster gesloten`, serverpoort gesloten, PostgreSQL gestopt, `data\` behouden; `--rc-quit` zonder draaiende app exit 0 en opent geen venster; purge-uninstall ruimt op. Het tray-/menuklik zelf is niet aangeklikt |
| Upgrade vanaf WebView2-build | oude installatie simuleren (3 WebView2-DLL's + `data\webview`) → upgrade | **PASS** — 11/11: de oude window-host en het oude browserprofiel verdwijnen, `data\` en `roomcraft.env` blijven, venster aanwezig, `--selftest` groen, purge-uninstall ruimt op |
| Desktop-app | geïnstalleerde app starten, venster sluiten, project aanmaken, upgraden, verwijderen | **PASS** — 27/27 checks: 247 MB installer; venster `electron\RoomCraftWindow.exe` met eigen engine rendert de interface (28 elementen, titel `RoomCraft NL — interieurplanner`), 0 `msedgewebview2`-processen en geen WebView2-bestanden in de installatie; profiel in `data\electron`; `/api/auth/me` geeft lokale gebruiker (`lokaal@roomcraft.local`, `desktop:true`), project aanmaken zonder sessie `201`; venster sluiten → launcher exit 0 en server + PostgreSQL gestopt; `--selftest` inclusief verborgen venster-render exit 0; upgrade terwijl de app draait exit 0, data en project intact, één snelkoppeling; purge-uninstall ruimt de map volledig op. Niet visueel geïnspecteerd |
| Installer-review | code-review `Setup.cs`/`build-installer.mjs` + herverificatie | **PASS** — 16/16 upgrade (inclusief upgrade terwijl launcher/Node/PostgreSQL draaien, zonder sleeps), 8/8 rollback (3590 bestanden byte-identiek), afgekapte installer exit 1; dode takken weg (dubbele doel-verwijdering, pakketcheck, PowerShell-tar-fallback); `data\`, poorten, seed-marker en `roomcraft.env` aantoonbaar ongewijzigd |
| Upgrade-rollback | upgrade met geforceerde fout (`ROLLBACK_TEST`, na het plaatsen van de mappen) | **PASS** — 16/16 checks: exit 1 met melding dat de vorige installatie is hersteld; 3590 bestanden byte-identiek terug (0 ontbrekend/nieuw/gewijzigd), geen backup- of staging-rest, data/poorten/JWT-secret intact, project met 3 items intact, `--selftest` groen, en een gewone upgrade daarna slaagt ook (oude bestanden weg, één snelkoppeling) |
| Installer-versie | `package.json` 1.0.1 bouwen, installeren, daarna 1.0.2 eroverheen | **PASS** — `DisplayVersion` volgt de build (1.0.1 → 1.0.2) en de setup-exe heeft FileVersion 1.0.1.0; eindbuild met 1.0.0 registreert 1.0.0 en ruimt daarna volledig op |
| Uninstall-behoud | project aanmaken → upgrade → `--uninstall /S` → herinstallatie | **PASS** — 21/21 checks: `data\`, pgdata, poorten en JWT-secret blijven bij een stille uninstall; project `Uninstall-test` met 3 items intact na herinstallatie; programma-bestanden, snelkoppeling en registervermelding weg; alleen `/PURGEDATA` verwijdert de map volledig |

The Playwright editor test also proves: placed furniture survives a full page
reload (PostgreSQL persistence), undo/redo changes the item count, selecting a
budget line syncs the inspector and 3D gizmo without page errors, and both JSON
and composed PNG downloads fire.

## Feature status

| Area | Feature | Status |
| --- | --- | --- |
| Auth | Register, login, logout, session refresh, protected API | ✅ working |
| Auth | Rate limiting, origin checks, bcrypt, httpOnly cookie | ✅ working |
| Projects | Create, list, open, rename, describe, duplicate, delete | ✅ working |
| Projects | Named versions + restore, dashboard thumbnails | ✅ working |
| Room | Exterior walls, thickness, height, ceiling, grid snap | ✅ working |
| Room | Doors/windows add, move, resize, remove; swing arcs | ✅ working |
| Room | Partition walls (draw with tool, delete) | ✅ working |
| 2D | Pan/zoom/fit, grid, floor, wall selection, measure tool | ✅ working |
| 2D | Furniture drag, snap, rotate handle, multi-select, lock | ✅ working |
| 2D | Undo/redo (buttons + Ctrl+Z/Y), duplicate, delete, nudge | ✅ working |
| 3D | Extruded walls with real openings, floor, ceiling toggle | ✅ working |
| 3D | Procedural furniture, GLB loader + fallback | ✅ (no GLB assets shipped) |
| 3D | Selection sync, translate/rotate gizmo, camera reset | ✅ working |
| Furniture | Catalog with real dimensions, free-spot placement | ✅ working |
| Furniture | Align to nearest wall, colour + material overrides | ✅ working |
| Decoration | 7 floor finishes, 8 wall finishes, ceiling colour | ✅ working |
| Fit | Wall/furniture collisions, door swing, circulation, windows, ceiling | ✅ working |
| Budget | Total, limit, remaining, category breakdown, order list | ✅ working |
| Budget | CSV export | ✅ working |
| AI | 3 deterministic proposals, ghost preview, approve/reject | ✅ working |
| AI | Budget trimming and style/brief weighting | ✅ working |
| Export | Plan PNG (composed stage), 3D PNG, JSON, CSV | ✅ working |
| Import | Design JSON, schema-validated, unknown products rejected | ✅ working (unit + e2e round-trip; 2D refits after import) |
| Retailers | Adapter interface, status reporting, feed sync endpoint | ⚠️ interface only — no live feeds |
| Retailers | Real product data from IKEA/Leen Bakker/Kwantum/Praxis/Goossens | ❌ blocked (needs agreements) |
| Export | PDF / print layout | ❌ not built |
| Scale | Multi-room, floors, collaboration | ❌ not built |

## Configuration that was actually exercised

```env
DATABASE_URL="postgresql://roomcraft:roomcraft@127.0.0.1:5433/roomcraft?schema=public"
PORT=4000
NODE_ENV=development
JWT_SECRET="dev-only-change-me-please-0123456789abcdef"
SESSION_COOKIE_NAME="roomcraft_session"
CLIENT_ORIGIN="http://localhost:5173"
```

All `*_FEED_URL` / `*_API_KEY` values are empty. This is why every retailer
connector reports `not_configured` and why the UI labels the catalog as demo data.
No retailer data was scraped or simulated as if it were live.

## How to run (verified sequence)

```bash
cd roomcraft-nl
npm install
npm run db:start        # terminal 1 — real PostgreSQL on 5433
npx prisma migrate dev  # first time only (also generates the client)
npm run db:seed         # first time only
npm run dev             # terminal 2 — API + Vite
```

Then open <http://localhost:5173> and log in with the demo account.

The Prisma client is generated into `server/generated/prisma` (gitignored); run
`npm run db:generate` after a fresh clone if `migrate dev` is not used.

## Known limitations & next steps

1. **Retailer feeds** — implement mapping per retailer once a feed contract is
   signed; the adapter and `/api/retailers/:id/sync` endpoint are ready. Add
   affiliate links per product.
2. **GLB library** — purchase or model licensed furniture assets, host them, and
   fill `Product.modelUrl`. The loader, scaling and fallback path already work.
3. **PDF/print** — a print stylesheet or server-side PDF of the plan + budget.
4. **Bundle size** — split the 3D stack behind a lazy route so the 2D-only
   editor ships a much smaller initial bundle.
5. **More rooms per project** — the model is single-room; extend `DesignDoc` with
   a room array and a room selector before adding this.
6. **Playwright in CI** — install bundled browsers in CI; the local run used
   Chrome because the CDN download failed on this machine.
