# Validation record

Verified locally on **9 November 2026** with Node 24.22.1, Windows, Microsoft Edge, npm 12.2.2, and Docker Engine 28.5.1 / Compose 2.40.2. The container uses Node 24.22.2 on Debian Linux.

| Check                                                | Observed result                                                                                           |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Strict TypeScript (`npm run typecheck`)              | Passed                                                                                                    |
| ESLint (`npm run lint`)                              | Passed                                                                                                    |
| Vitest 5.1 + React Testing Library (`npm test`)      | 31 tests passed across 5 files                                                                            |
| Production build (`npm run build`)                   | Passed; manifest/service worker and PNG/maskable icons generated                                          |
| Playwright / Edge (`npm run test:e2e`)               | 3 scenarios passed                                                                                        |
| Production dependency audit (`npm audit --omit=dev`) | Zero reported vulnerabilities                                                                             |
| Full development dependency audit                    | No moderate/high/critical findings; 4 low package findings in the PWA build dependency chain              |
| Frontend bundle credential scan                      | No backend credential names or fixture key found in JS assets                                             |
| Docker Compose                                       | Final source built; non-root startup, health, authentication, and restart/recreation persistence verified |

The three browser scenarios cover UI creation, actual backend process restart, SQLite persistence, deterministic synthetic status updates, expanded event history, archive/restore, production service-worker activation, offline shell reload, offline edit and create, queue synchronization, duplicate import preview, uncertain courier handling, search, light/dark themes, 390px mobile and 1440px desktop overflow checks, navigation and Bahasa selection. Independent preview captures were visually inspected in desktop, dark and mobile layouts.

Domain/integration coverage includes conservative status normalization, partial PATCH semantics (omitted fields never acquire creation defaults), event fingerprints, duplicate detection, bounded backoff, delivered/archive polling stop, notification deduplication, provider fallback and accounting, global/provider request and spend caps, request serialization, authentication pause, Retry-After, scheduler recovery, migrations, create/edit/delete, missing keys, idempotent replay, JSON merge validation, SQLite backup/restore, malformed backup rejection, Host/Origin protection, rate limits and protected non-loopback access.

Real adapter tests use HTTP fixtures and the official Klik Resi SDK. Klik Resi, RajaOngkir and restricted Biteship adapters are implemented and contract-tested. **No real API account or real private shipment was supplied; no live tracking integration is claimed as passed.** The next live check is Settings → configure/enable provider → enable real calls with a budget → refresh one real parcel. Klik Resi's connection test can separately verify account authentication when credentials are supplied.

The four remaining low findings share the development-only [`deepmerge` prototype-poisoning advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4), propagated through `@rollup/plugin-node-resolve`, `workbox-build`, and `vite-plugin-pwa`. The published latest deepmerge version observed was 4.3.1. This build chain does not ship in the runtime Docker image. Production audit is clean. Recheck upstream fixes before future dependency upgrades.

Build warnings are limited to an upstream Zod annotation warning and the main JS chunk being slightly over 500 kB minified (about 159 kB gzip); they do not prevent build or PWA precaching. GitHub Actions is configured for Node 24, Chromium E2E tests, and production audit; its remote result is separate from the local checks recorded here.
