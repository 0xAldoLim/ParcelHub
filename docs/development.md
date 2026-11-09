# Development

For installation and normal browser use, start with the [README](../README.md). This page covers working on the application.

## Development server

Use Node.js 24.10 or later with npm. From the repository root:

```sh
npm ci
# First setup only; preserve an existing .env containing your configuration.
cp .env.example .env
npm run dev
```

On PowerShell, use `Copy-Item .env.example .env` for the first setup. The Windows launcher also supports `powershell -NoProfile -ExecutionPolicy Bypass -File .\Start-ParcelHub.ps1 -Development`.

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Vite proxies API requests to the backend on port 3001. Both bind to localhost by default. Use one consistent hostname to avoid separate IndexedDB and service-worker caches.

The production app uses port 3001 for both the frontend and API:

```sh
npm run build
npm start
```

PWA precaching and the offline shell are enabled in production builds. They are not enabled by the Vite development server. Installing the PWA does not keep the backend running.

## Project layout

```text
apps/web/                  React, TypeScript, Vite, Tailwind, TanStack Query, PWA
apps/server/src/
  modules/                 Parcel CRUD, import/export, backup and restore
  persistence/             Drizzle schema/proxy reads, SQLite and migrations
  providers/               Provider contracts, errors, real and mock adapters
  tracking/                Provider selection, budgets, refreshes and transitions
  scheduler/               Persistent due-time polling and recovery
packages/shared/src/       Domain types, Zod validation and normalization
tests/                     Vitest, React Testing Library and Playwright
docs/                      Architecture, providers, deployment and validation
```

## Validation

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm audit --omit=dev
```

`npm run check` runs TypeScript, lint, unit/integration tests, and the production build. Build before running the end-to-end suite.

Playwright defaults to installed Microsoft Edge on Windows and bundled Chromium on other platforms. Set `PLAYWRIGHT_CHANNEL=chrome` to use Chrome, or `PLAYWRIGHT_CHANNEL=chromium` to use bundled Chromium. Install the required browser with `npx playwright install chromium` or `npx playwright install msedge`.

Browser tests start their own isolated backend, restart its process, and verify persistence, explicitly synthetic tracking, archive/restore, offline editing and synchronization, import previews, themes, language, and responsive layouts. They use temporary databases. Fixture tests do not prove live provider account access. See the [validation record](validation.md) for observed results and dependency audit notes.

## Provider configuration

API keys belong in the server `.env`; never add a `VITE_` prefix or expose them in browser responses. The [provider guide](provider-comparison.md) records researched endpoints, supported contracts, account restrictions, and verification limits.

Mock tracking is opt-in per parcel and never a fallback for real tracking. Its default stage interval is one minute; `MOCK_STEP_MS` can shorten the interval for automated tests. Unknown provider statuses remain `UNKNOWN`.

Authentication failures persistently pause a provider. After changing credentials and restarting, use **Settings → Reset circuit / auth pause**. Page loads read saved tracking data rather than dispatching new tracking API requests.

## Persistence and deployment

SQLite remains authoritative when the backend is reachable. The browser keeps a snapshot and explicit mutation queue for offline use. JSON import merges validated parcels; SQLite restore replaces validated records transactionally and preserves a safety backup under `DATA_DIR/backups/`.

Read the [architecture](architecture.md) for synchronization, scheduling, accounting, notifications, and security decisions. Use the [deployment guide](deployment.md) for Docker, data directories, authentication, LAN/internet access, and recovery. Run only one backend process per data directory.
