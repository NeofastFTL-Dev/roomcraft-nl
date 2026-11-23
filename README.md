# RoomCraft NL

Interieurplanner: teken je kamer op ware grootte, richt hem in 2D én 3D synchroon
in, controleer pasvorm en budget, laat je een indeling voorstellen en exporteer je
ontwerp.

Stack: React 19 · TypeScript · Vite · Konva · Three.js / React Three Fiber ·
Express 5 · PostgreSQL · Prisma 7 · Zod · Vitest · Playwright.

## Platforms en automatische builds

De app staat in vijf branches. `main` is de volledige broncode; elke
platformbranch voegt het pakket en de autobuild voor dat platform toe.

| Branch | Wat de autobuild maakt | Workflow |
| --- | --- | --- |
| `main` | alle vier de pakketten, samen in één release | `release-all.yml` |
| `windows` | `RoomCraft NL Setup.exe` (Windows 10/11, x64) | `build-windows.yml` |
| `macos` | `.dmg` + `.zip` (macOS, Apple Silicon) | `build-macos.yml` |
| `linux` | `.AppImage` (Linux, x64) | `build-linux.yml` |
| `android` | `.apk` (RoomCraft-client voor een RoomCraft-server) | `build-android.yml` |

Alle releases komen van `main`, via `release-all.yml`:

* **Een tag `v*` naar `main` pushen** bouwt op de vier platformbranches alle
  vier de pakketten en hangt ze aan één GitHub-release met die tag. De versie
  is de tag zonder `v`: `v1.2.0` wordt `1.2.0`.
* **Run workflow** op `main` bouwt hetzelfde. Met *publish* aan komt er een
  release met dezelfde naam; zonder *version* is de versie
  `<package.json>-dev.<run_number>`.

Elke release legt eerst de commit van elke platformbranch vast en bouwt precies
die commits; `release-all.yml` noemt de vier SHA's in de release-opmerkingen,
zodat je ziet welke code in een versie zit.

De workflows op de platformbranches zijn herbruikbaar: `release-all.yml` roept
ze aan met `uses: …/build-windows.yml@windows` (enzovoort), dus elke build
bestaat maar één keer en de versie wordt één keer op `main` bepaald. Ze
starten daarnaast alleen bij een push naar hun eigen branch en leveren dan een
artifact, geen release. Een tag of handmatige run op
zo'n branch doet niets: GitHub voert een workflow alleen uit vanaf de default
branch, dus `main` is het startpunt voor elke build en elke release.

De desktoppakketten bundelen Node.js, PostgreSQL en de productie-dependencies,
zodat de doelcomputer niets hoeft te installeren. De Android-app is een
WebView-client: hij opent de interface van een RoomCraft-server (desktop of
LAN) en vraagt eenmalig om het adres.

---

## Snel starten

Vereisten: Node.js 20.19+ (getest met 24) en npm.

```bash
cd roomcraft-nl
npm install
cp .env.example .env          # Windows: copy .env.example .env
npm run db:start              # start een echte PostgreSQL 18 op poort 5433
```

De Prisma Client wordt gegenereerd in `server/generated/prisma` (niet in git).
`npx prisma migrate dev` doet dat automatisch; los genereren kan met
`npm run db:generate`.

In een tweede terminal (of laat `db:start` doorlopen):

```bash
npx prisma migrate dev        # maakt het schema aan
npm run db:seed               # 33 demo-producten + demo-account
npm run dev                   # API op :4000 en Vite op :5173
```

Open <http://localhost:5173>.

Demo-account: **demo@roomcraft.nl** / **Roomcraft123!** (of registreer een eigen
account).

### Eigen PostgreSQL gebruiken

`npm run db:start` start een lokale cluster in `.pgdata` met de meegeleverde
PostgreSQL-binaries. Heb je al een server, zet dan `DATABASE_URL` in `.env` naar
die server en voer `npx prisma migrate deploy` (of `migrate dev`) uit. De app
verwacht PostgreSQL; er is geen SQLite-modus.

## Scripts

| Script | Doel |
| --- | --- |
| `npm run dev` | API + Vite samen |
| `npm run dev:api` | alleen de Express API (poort 4000) |
| `npm run dev:web` | alleen de Vite-client (poort 5173) |
| `npm run db:start` | lokale PostgreSQL starten |
| `npm run db:generate` | Prisma Client genereren |
| `npm run db:migrate` | migratie maken/toepassen |
| `npm run db:seed` | demo-catalogus en demo-account |
| `npm run build` | typecheck (shared/server/client) + productiebuild |
| `npm test` | Vitest domeintests |
| `npm run e2e` | Playwright (eerst `npx playwright install chromium`) |

## Wat zit erin

* **2D-plattegrond (Konva)** — muren met dikte, deuren met draaihoek, ramen,
  scheidingswanden, meten, zoomen/pannen, meubels slepen en draaien (15°),
  raster-snapping, undo/redo.
* **3D-weergave (React Three Fiber)** — dezelfde geometrie, muren met echte
  openingen, procedurele meubels op ware afmetingen, GLB-ondersteuning,
  transform-gizmo, camera- en plafondschakelaar.
* **Furniture engine** — producten met echte afmetingen (cm), vrije plek zoeken,
  uitlijnen tegen de muur, kleur/materiaal overschrijven.
* **Catalogus** — zoeken, filteren op categorie/winkel/stijl/prijs. De
  meegeleverde artikelen zijn **duidelijk gelabelde demo-artikelen**, geen aanbod
  van een echte winkel.
* **Decoratiestudio** — vloer- en muurafwerkingen, plafondkleur, kleuren en
  materialen per meubel.
* **Pasvormchecker** — muur- en meubelbotsingen, deurdraaicirkel, looproute,
  raamobstructie, plafondhoogte.
* **Budget** — totaal, per categorie, bestellijst, budgetlimiet en CSV-export.
* **Projectopslag** — PostgreSQL/Prisma, versies bewaren en herstellen,
  dupliceren, miniatuur op het dashboard.
* **AI-ontwerper** — deterministische indelingsengine met drie voorstellen; jij
  keurt goed of verwerpt. Er wordt niets automatisch toegepast.
* **Export** — plattegrond-PNG, 3D-PNG, ontwerp-JSON, budget-CSV.
* **Import** — een geëxporteerd ontwerp-JSON terugzetten; het bestand wordt in de
  browser gevalideerd met dezelfde regels als `designDocSchema` via de lichte
  validator in `shared/designValidation.ts` (dus zonder zod in de bundel; de
  server valideert opnieuw met zod) en onbekende product-ID's worden met een
  duidelijke melding geweigerd.

## Projectstructuur

```
client/   React-app (Vite root)
server/   Express API + Prisma client (gegenereerd)
shared/   domein: geometrie, pasvorm, budget, planner, catalogus, Zod-schema's
prisma/   schema, migraties, seed
e2e/      Playwright-tests
```

De map `shared/` is de enige bron van waarheid voor kamergeometrie en meubels; de
2D- en 3D-editor, de pasvormchecker, het budget en de planner gebruiken allemaal
dezelfde functies.

## Windows-installer

`node installer/build-installer.mjs` bouwt één zelfstandige installer:
`installer/out/RoomCraft NL Setup.exe` (~247 MB). De installer en de launcher
zijn in C# geschreven (.NET Framework 4.8, met de compiler die Windows meelevert);
de app zelf blijft de bestaande React/Node-app.

Meegebundeld: Node.js 24, PostgreSQL 18-serverbinaries, de productie-
dependencies, de gebouwde client en de server/shared-bronnen. Op de doelcomputer
is dus geen Node, npm of PostgreSQL nodig. De installer installeert per gebruiker
in `%LOCALAPPDATA%\Programs\RoomCraft NL`, maakt snelkoppelingen en een
verwijderingsvermelding, en start daarna `RoomCraft.exe`.

De launcher start PostgreSQL op een vrije lokale poort (vanaf 55432), maakt de
database en het schema aan, laadt de demo-catalogus en start de server op
`http://127.0.0.1:41731` (of de eerstvolgende vrije poort). De app opent in een
eigen programmavenster met een eigen, meegeleverde engine: geen browser, geen Edge
en geen WebView2-runtime nodig, en alles werkt offline. Er zijn geen accounts: de
desktop-app werkt met één lokale gebruiker, zonder inloggen of registreren.
Gegevens staan in `data\` naast de installatie (inclusief het vensterprofiel in
`data\electron`).

Opnieuw installeren over een bestaande installatie stopt eerst een draaiende
RoomCraft en de meegeleverde PostgreSQL, vervangt daarna alle programma-bestanden
en laat `data\` plus het JWT-secret in `roomcraft.env` staan. Projecten en
sessies blijven dus werken, en de snelkoppelingen worden opnieuw aangemaakt in
plaats van gedupliceerd.

```
RoomCraft.exe              app starten (venster + systeemvak)
RoomCraft.exe --selftest   starten, pagina + lokale gebruiker + projecten controleren, stoppen
RoomCraft.exe --uninstall  snelkoppelingen, registervermelding en programmabestanden verwijderen
```

Bij verwijderen blijven `data\` en het JWT-secret in `roomcraft.env` bewaard, dus
je projecten blijven staan; in de installatiemap blijft een korte uitleg achter.
Ook een stille verwijdering (`RoomCraft.exe --uninstall /S`) laat de gegevens
staan. Alleen met `/PURGEDATA` worden de database en ontwerpen gewist.

Zie `installer/README.md` voor details en de stille installatie (`/S`).

## Android-pakket (branch `android`)

De planner zelf draait op de computer (PostgreSQL + Express); de Android-app is
de client. Bij de eerste start vul je het adres van de RoomCraft-server in
(bijvoorbeeld `http://192.168.1.20:41731`); dat adres wordt onthouden en is via
het menu te wijzigen.

`gradle -p android assembleRelease` bouwt de ondertekende release-APK
(`android/app/build/outputs/apk/release/app-release.apk`); de autobuild uploadt
hem als `RoomCraft-NL-<versie>-android.apk`. Er worden geen debug-APK's meer
uitgebracht.

### Ondertekening

De release-APK wordt ondertekend met de keystore uit vier repository-secrets:

| Secret | Inhoud |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | de keystore (PKCS12 of JKS) als base64 |
| `ANDROID_KEYSTORE_PASSWORD` | het wachtwoord van de keystore |
| `ANDROID_KEY_ALIAS` | de alias van de sleutel in de keystore |
| `ANDROID_KEY_PASSWORD` | het wachtwoord van de sleutel (meestal gelijk aan het keystore-wachtwoord) |

```bash
gh secret set ANDROID_KEYSTORE_BASE64 < <(base64 -w0 release.keystore)
gh secret set ANDROID_KEYSTORE_PASSWORD
gh secret set ANDROID_KEY_ALIAS
gh secret set ANDROID_KEY_PASSWORD
```

Ontbreken die secrets, dan **faalt** de build: een release-APK moet altijd met
de vaste releasesleutel zijn ondertekend, anders is hij later niet in-place bij
te werken. De autobuild vergelijkt daarnaast de SHA-256-vingerafdruk van het
APK-certificaat met de vaste waarde `EXPECTED_CERT_SHA256` in
`.github/workflows/build-android.yml` en faalt bij een andere sleutel. Wissel je
van keystore, werk dan die vingerafdruk mee bij. Alleen een push naar de `android`-branch (een proefbuild, geen
release) gebruikt bij ontbrekende secrets een tijdelijke sleutel en meldt dat
als waarschuwing. Een eigen keystore maak je met:

```bash
keytool -genkeypair -keystore release.keystore -storetype PKCS12 \
  -alias roomcraft -keyalg RSA -keysize 3072 -validity 10000 \
  -dname "CN=RoomCraft NL, O=RoomCraft NL, C=NL"
```

Lokaal met dezelfde sleutel bouwen: zet `ANDROID_KEYSTORE_PATH`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` en `ANDROID_KEY_PASSWORD` vóór
`gradle -p android assembleRelease`.

## Winkels koppelen

Er is bewust **geen** scraping. Elke winkel heeft een adapter in
`server/retailers.ts` die pas actief wordt met een productfeed uit een
handelsovereenkomst:

```env
IKEA_NL_FEED_URL=
IKEA_NL_API_KEY=
LEENBAKKER_FEED_URL=
LEENBAKKER_API_KEY=
KWANTUM_FEED_URL=
KWANTUM_API_KEY=
PRAXIS_FEED_URL=
PRAXIS_API_KEY=
GOOSSENS_FEED_URL=
GOOSSENS_API_KEY=
```

Zonder feed blijft de winkel `not_configured` en toont de app dat eerlijk. Het
feedcontract staat in `BUILD_PLAN.md` §9.

## Documentatie

* [`BUILD_PLAN.md`](./BUILD_PLAN.md) — architectuur, regels, API, fases, hiaten
* [`PROJECT_STATUS.md`](./PROJECT_STATUS.md) — taakstatus en verificatieresultaten
* [`CHANGELOG.md`](./CHANGELOG.md) — wijzigingen

## Beveiliging

Wachtwoorden met bcrypt, JWT in een httpOnly-cookie, SameSite=Lax, origin-check op
mutaties, rate limiting op inloggen, Zod-validatie en eigendomscontrole op elke
projectroute. Zet in productie altijd een eigen `JWT_SECRET` en gebruik HTTPS
(`NODE_ENV=production` zet `secure` op de cookie).
