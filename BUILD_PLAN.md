# RoomCraft NL — Build Plan & Architecture

> Interieurplanner voor de Nederlandse markt: teken een kamer op ware grootte,
> richt hem in 2D en 3D synchroon in, controleer pasvorm en budget en exporteer
> het ontwerp.

This document is the engineering contract for the application. It describes what
is built, how the pieces fit together, and which parts are intentionally
unfinished (retailer feeds, GLB assets).

---

## 1. Product summary

A user can:

1. Create an account and log in.
2. Define an accurately measured room (walls, thickness, height, doors, windows,
   partitions).
3. Furnish it with real-sized furniture from a product catalog.
4. Customise materials, colours and surfaces (decoration studio).
5. See the room simultaneously as a 2D plan and a 3D scene.
6. Run a fit check (collisions, door swings, window obstruction, circulation).
7. Track cost per category against a budget.
8. Ask the design assistant for layout proposals and approve or reject them.
9. Save projects, create named versions, restore versions.
10. Export a plan PNG, a 3D PNG, the design JSON and the budget CSV.

## 2. Success criteria → implementation

| Criterion (from the brief) | Where it lives | State |
| --- | --- | --- |
| Account, protected projects | `server/routes/auth.ts`, `server/routes/projects.ts`, `client/src/stores/authStore.ts` | Done |
| Accurately measured room | `shared/geometry.ts`, `client/src/components/panels/RoomPanel.tsx` | Done (metres, 4 mm tolerance) |
| Walls, windows and doors | `Wall.openings`, Konva renderer, extruded 3D wall with holes | Done |
| Real-sized furniture | `Product.dimensions`, placement captures dimensions | Done |
| Materials and decoration | `shared/catalog.ts` surfaces, `DecorPanel`, `ItemPanel` | Done |
| Dutch retailer products | `server/retailers.ts` adapters + catalog | **Interface only** — no live feeds (see §9) |
| Total cost | `shared/budget.ts`, `BudgetPanel` | Done |
| Save project | Prisma `Project`, autosave-on-demand, versions | Done |
| Export design | PNG (2D/3D), JSON, CSV | Done |
| AI proposes, user approves | `shared/planner.ts`, `POST /api/ai/suggest`, ghost layer | Done |

## 3. Stack

| Layer | Choice |
| --- | --- |
| UI | React 19 + TypeScript, Vite 8 |
| 2D editor | Konva 10 / react-konva (metre-based stage transform) |
| 3D | Three.js 0.187 + React Three Fiber 9 + drei 10 |
| State | Zustand 5 with snapshot undo/redo |
| Validation | Zod 4 (shared between client and server) |
| API | Node.js + Express 5 |
| Database | PostgreSQL 18 + Prisma ORM 7 (`prisma-client` generator, `@prisma/adapter-pg`) |
| Auth | bcryptjs + JWT in httpOnly cookie |
| Tests | Vitest (domain), Playwright (end-to-end) |

Deliberately avoided: a UI framework (plain CSS gives full control over the dark
responsive design), a client router (hash routing is enough for two screens),
and any charting/3D-helpers that would download assets at runtime.

## 4. Repository layout

```
roomcraft-nl/
├─ client/
│  ├─ index.html
│  └─ src/
│     ├─ api.ts                  typed fetch client
│     ├─ stores/                 authStore, editorStore (history + editing)
│     ├─ components/
│     │  ├─ RoomCanvas2D.tsx     Konva plan editor
│     │  ├─ RoomView3D.tsx       R3F scene, walls, camera rig, gizmo
│     │  ├─ FurnitureModel3D.tsx procedural + GLB furniture
│     │  ├─ Inspector.tsx        tabbed right panel
│     │  └─ panels/              catalog, room, item, decor, fit, budget, AI, project
│     └─ pages/                  auth, dashboard, editor
├─ server/
│  ├─ app.ts, index.ts, env.ts, db.ts, auth.ts
│  ├─ routes/                    auth, projects, catalog, ai
│  ├─ retailers.ts               adapter interface + 12 NL connectors
│  └─ generated/prisma/          generated client (not committed)
├─ shared/                       the domain package used by both sides
│  ├─ types.ts, geometry.ts, fit.ts, budget.ts, planner.ts
│  ├─ catalog.ts                 demo products + surface/material palettes
│  └─ *.test.ts                  26 domain tests
├─ prisma/                       schema, migrations, seed
├─ scripts/pg-dev.mjs            local PostgreSQL 18 launcher
└─ e2e/                          Playwright specs
```

## 5. Single source of truth

`shared/` is imported by both the browser and the server (Vite alias `@shared`,
tsconfig path mapping). There is no duplicated geometry logic.

* A room is a list of `Wall` segments. Exterior walls must form a closed loop;
  the floor polygon is derived from them (`roomOutline`).
* Every opening (door/window) is an interval on its wall: `center`, `width`,
  `height`, `sillHeight`. Nothing else stores window positions.
* Furniture is a `Placement`: centre + rotation + dimensions captured at placement
  time, so a saved design stays readable even if a product changes.
* 2D, 3D, fit checks, budget and the planner all consume the same `DesignDoc`.

### Coordinates

* Units: metres everywhere in the domain and in both renderers.
* Plan axes: `x` east, `z` south. `rotation` is degrees clockwise from +X.
* Konva draws in the same axes (`y` = `z`), so a group rotation is the placement
  rotation directly, and the Stage scale converts metres to pixels.
* Three.js: `rotation.y = -rad(rotation)` because rotating +X towards +Z in plan
  view is a negative rotation around Y in three.js.
* Furniture local axes: width along local X, depth along local Z. Collision
  tests use oriented bounding boxes (SAT) built from the same dimensions.

### Wall geometry in 3D

Each wall is a `THREE.Shape` in wall-local X/Y, extruded by its thickness, with a
rectangular hole per opening. The mesh sits at the wall midpoint and is rotated
`-wallAngle`. This guarantees that what you see in 3D matches the 2D opening
positions exactly — there is no separate 3D wall model.

## 6. Feature specifications

### 6.1 2D editor (Konva)

* Grid (0.5 m minor, 1 m major) and floor polygon.
* Walls with their real thickness; openings drawn as gaps, doors with a swing
  leaf and arc on the inward side, windows in glass blue.
* Tools: select, pan, partition wall (two clicks), door, window, measure.
* Furniture: drag with grid snapping, rotate handle (15° steps), arrow-key nudge,
  shift-click multi-select, lock, duplicate, align to nearest wall.
* Wheel zoom around the cursor, "Passend maken", pan tool.
* Ghost layer for a pending AI proposal (dashed green, not applied).

### 6.2 3D editor (R3F)

* Floor polygon, extruded walls with openings, optional translucent ceiling.
* Procedural furniture per category (seat, table, storage, bed, lamp, rug, plant,
  wall decor) using the real dimensions and the selected colour/material.
* GLB/glTF loading via `useGLTF` when a product supplies `modelUrl`, scaled to the
  product's bounding box, with an error boundary fallback to procedural geometry.
  No demo product ships a GLB, so the fallback is what you see today.
* Selection syncs with 2D and the inspector; `TransformControls` moves/rotates on
  the floor plane; camera reset, ceiling toggle, orbit/zoom.
* Performance: capped DPR, one 2048 shadow map, memoised geometry with explicit
  disposal, no runtime asset downloads.

### 6.3 Furniture engine

Add a product → `findFreePosition` scans the room on a 0.2 m grid from the centre
outwards and keeps the first position with no blocking fit issues. Wall-mounted
items start at wall height. All dimension edits are intentionally read-only in the
inspector: the catalog is the source of truth for sizes.

### 6.4 Fit checker (`shared/fit.ts`)

| Code | Severity | Rule |
| --- | --- | --- |
| `invalid-room` | error | geometry validation (closed loop, min area, opening bounds/overlap) |
| `outside-room` | error | any footprint corner outside the floor polygon |
| `wall-collision` | error | footprint overlaps a wall body by more than 4 mm |
| `furniture-overlap` | error/warning | OBB overlap with overlapping vertical ranges; rugs are exempt; decor/plants are warnings |
| `door-blocked` | error | footprint intersects the door swing area (depth = leaf width) |
| `door-path-blocked` | warning | walking line from door to room centre is crossed |
| `window-obstructed` | warning | item taller than the sill in front of a window |
| `ceiling-collision` | error | `elevation + height > ceiling` |
| `floating-item` | warning | elevated floor item without wall mounting |
| `product-missing` | warning | placement references a product that no longer exists |
| `budget-exceeded` | warning | budget summary over the limit |

### 6.5 Budget

`computeBudget` aggregates duplicate products into quantity lines, groups by
category, computes remaining/over-budget and lists unknown product ids. It feeds
the status bar, the budget panel, the CSV export and the AI planner.

### 6.6 Project storage

PostgreSQL via Prisma. The design document is stored as validated JSON because
room geometry is a graph that is always read as a whole; the surrounding data
(owner, name, description, versions, thumbnail) is relational. Every read/write
is scoped by `userId`. Versions are immutable snapshots that can be restored.

### 6.7 AI design assistant

`shared/planner.ts` is a deterministic rule-based layout engine:

1. Compose a programme per room type (living, bedroom, dining, office, studio).
2. Choose products per slot, weighted by style match and (for the budget variant)
   price.
3. Place anchors against walls by scanning free wall spans (doors excluded, and
   windows excluded for tall storage), scoring centring, wall length, window
   proximity and clear floor in front.
4. Place dependent items relative to anchors (coffee table in front of the sofa,
   four chairs around a dining table, rug under the table, lamp beside the sofa).
5. Reject any candidate that would introduce a blocking fit error (same fit code
   as the UI).
6. Trim optional extras until the budget is met where possible.

Three variants are returned (balanced, budget, spacious). The server endpoint
`POST /api/ai/suggest` never writes to a project. The client shows a ghost layer
and only `applyProposal` (an explicit "Goedkeuren" click) mutates the design, with
undo support. An LLM could replace the engine behind the same response contract;
no API key is required today.

### 6.8 Export

Client-side, so no data leaves the browser:

* 2D plan PNG from the Konva stage canvas.
* 3D PNG from the R3F canvas (`preserveDrawingBuffer`).
* Design JSON (room, placements, budget) with metadata.
* Budget CSV (UTF-8 BOM, `;` separator for Dutch Excel).

## 7. API

All JSON, cookie-authenticated (`roomcraft_session`, httpOnly, SameSite=Lax).

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | liveness + database ping |
| POST | `/api/auth/register` | create account, start session |
| POST | `/api/auth/login` | start session |
| POST | `/api/auth/logout` | clear cookie |
| GET | `/api/auth/me` | current user or `null` |
| GET | `/api/projects` | list own projects (metadata + counts) |
| POST | `/api/projects` | create with a validated design |
| GET | `/api/projects/:id` | full project |
| PATCH | `/api/projects/:id` | name, description, thumbnail, design |
| DELETE | `/api/projects/:id` | delete + cascade versions |
| POST | `/api/projects/:id/duplicate` | copy |
| GET/POST | `/api/projects/:id/versions` | list / snapshot |
| POST | `/api/projects/:id/versions/:versionId/restore` | restore snapshot |
| GET | `/api/catalog` | filter by search, category, retailer, style, max price |
| GET | `/api/catalog/facets` | category counts + retailer status |
| GET | `/api/catalog/:id` | single product |
| GET | `/api/retailers` | adapter status (honest `not_configured`) |
| POST | `/api/retailers/:id/sync` | import a configured feed (409 without feed) |
| POST | `/api/ai/suggest` | three layout proposals, never mutates |

Validation: every body/query is parsed with Zod (`shared/validation.ts`); designs
are additionally checked with `validateRoomGeometry` and their product ids are
verified against the catalog.

## 8. Database (Prisma → PostgreSQL)

```
User 1─n Project 1─n ProjectVersion
Product (catalog, keyed by id, retail price in cents)
```

`Project.design` and `ProjectVersion.design` are `Json`. Everything else is
typed. `priceCents` avoids floating-point money. Product arrays (`materials`,
`styles`, `tags`) use PostgreSQL text arrays for filter queries.

## 9. Retailer integration architecture

Dutch retailers do not expose open product APIs. RoomCraft therefore ships an
**adapter interface**, not scrapers:

```ts
interface RetailerAdapter {
  id: string; name: string; country: string; docsUrl: string | null;
  feed: 'product-api' | 'product-feed' | 'none';
  status(): RetailerStatus;              // 'not_configured' until a feed URL exists
  fetchProducts(): Promise<Product[]>;   // throws RetailerNotConfiguredError otherwise
}
```

Connectors: IKEA Nederland, Leen Bakker, Kwantum, Praxis, Goossens. Each reads
`<RETAILER>_FEED_URL` / `<RETAILER>_API_KEY` from the environment. Feed contract:

```
GET <feedUrl>
Authorization: Bearer <apiKey>
→ { "items": [ { id, sku, name, brand?, category, price, width, depth, height,
                 url?, modelUrl?, imageUrl?, materials?, styles?, tags? } ] }
```

`POST /api/retailers/:id/sync` maps and upserts that payload. The sync code is
real, but **it has never been exercised against a live partner feed** — no
agreement or credentials exist in this environment. The UI states that plainly and
the demo catalog is always labelled as synthetic (`dataSource: "demo"`), never as
retailer data.

Compliance notes baked into the design:

* No scraping of retailer sites; feeds only, under a written agreement.
* Prices are shown with the source (demo vs retailer) and a "not a live offer"
  disclaimer for demo items.
* Affiliate/deep links are stored per product (`externalUrl`) but never fabricated.
* Product images/models are only shown from retailer-supplied URLs.

## 10. Security

* Passwords: bcrypt (cost 10); never returned by the API.
* Sessions: signed JWT, httpOnly + SameSite=Lax cookie, 7 days, cleared on
  invalid signature. `secure` in production.
* CSRF: state-changing requests reject unknown `Origin` values in addition to
  SameSite cookies.
* Rate limits on login/registration (in-memory, per IP).
* Every project query is scoped by the authenticated user id; no client-supplied
  owner ids.
* Design payloads are Zod-validated, size-limited (300 placements, 40 walls) and
  product ids checked against the catalog.
* Security headers (nosniff, no-referrer, frame DENY), `x-powered-by` disabled.
* Secrets stay in `.env` (gitignored); only `.env.example` is committed.

## 11. Testing strategy

* **Domain unit tests (Vitest)** — geometry, SAT collisions, door swing zones,
  fit rules, budget aggregation/CSV, planner validity for all room types.
* **End-to-end (Playwright)** — demo login, create project, place furniture,
  undo/redo, save + reload persistence, budget panel, JSON download, AI proposal
  preview and approval.
* Manual browser check — both canvases render (checked by sampling canvas pixel
  diversity) and the console has no errors.

Run:

```bash
npm test        # vitest
npm run e2e     # playwright (needs browsers: npx playwright install chromium)
npm run build   # typecheck all three projects + production build
```

## 12. Delivery phases

| Phase | Scope | State |
| --- | --- | --- |
| 0 | Repo inspection, PostgreSQL, Prisma schema, seed, docs | Done |
| 1 | Shared domain: types, geometry, validation, budget, fit | Done |
| 2 | API: auth, projects, versions, catalog, retailers | Done |
| 3 | Shell: auth page, dashboard, hash routing, design system | Done |
| 4 | 2D editor (Konva) | Done |
| 5 | 3D editor (R3F) + furniture models | Done |
| 6 | Inspector: catalog, room, item, decoration | Done |
| 7 | Fit checker, budget, exports | Done |
| 8 | AI designer + approval flow | Done |
| 9 | Tests, hardening, documentation | Done |
| 10 | Live retailer feeds, GLB library, PDF export | Not started (blocked/optional) |

## 13. Known gaps

1. **Live retailer data** — blocked on commercial agreements and credentials.
2. **GLB assets** — the loader and fallback exist; no licensed models are bundled.
3. **JSON import** — export is implemented; re-import via UI is not.
4. **PDF/print** — PNG exports only.
5. **Multi-room / multiple floors** — one room per project.
6. **Collaboration** — single-owner projects only.
7. **LLM copywriting/vision** — the planner is deterministic; the provider hook is
   documented, not wired to a paid API.
8. Checkout/cart hand-off to retailers — outside the current scope.
