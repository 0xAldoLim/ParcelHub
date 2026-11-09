# Deployment

## Native

Node 24.10+ includes the SQLite APIs used here. Install npm with Node, run `npm ci`, copy `.env.example` to `.env`, then `npm run dev`. Production is `npm run build` followed by `npm start` from the repository root. The development API listens at 127.0.0.1:3001; Vite at 127.0.0.1:5173. Production serves everything on 3001.

`DATA_DIR` defaults to `<repository>/data`; choose an absolute path to move persistent storage outside a checkout. The backend creates the directory and applies numbered migrations transactionally on startup. Keep only one backend process per database. Protect filesystem access; SQLite, exports, and verification phone fields contain personal data.

`.env` is loaded by the Node startup commands and is excluded from Git/Docker build context. API credentials are read only by backend modules. Restart after changing keys; clear a persisted authentication pause in Settings after restart.

## Docker

1. Install/start Docker Engine with Compose v2.
2. Copy `.env.example` to `.env`.
3. Generate a token, e.g. `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`, and put it in `PARCELHUB_AUTH_TOKEN`. At least 24 characters are mandatory for non-loopback bindings, including the container's internal 0.0.0.0 bind.
4. `docker compose up --build -d`
5. `docker compose ps` and open http://127.0.0.1:3001. Enter your token in the app login form.
6. `docker compose logs -f parcelhub` to view startup errors. HTTP `/api/health` returns only availability, never parcel data.
7. `docker compose down` stops/removes the container but retains `parcelhub-data`. Start again with `docker compose up -d`. Rebuilds preserve the named volume.

The multi-stage image installs locked dependencies, builds React and TypeScript, prunes development packages, and runs as non-root. It drops Linux capabilities and has an HTTP health check and restart policy. No secret is supplied at image build time.

**Do not run `docker compose down -v` unless deliberately deleting all stored data.** Use the app's SQLite backup before upgrades. Restore through Settings; a prior backup is downloaded automatically for undo. Coordinate restore with other browser devices; offline edits on another device cannot be inspected by this browser.

## Remote or LAN access

Set `HOST=0.0.0.0` and a strong `PARCELHUB_AUTH_TOKEN`. The app refuses startup without it. The Compose host mapping remains loopback by default; change the published host IP only when intentionally exposing it. Use HTTPS through a trusted reverse proxy for remote deployments, preserve the real Host header, and restrict access using your firewall/VPN. The server does not trust arbitrary forwarded headers. Proxy same-origin requests; no CORS wildcard is enabled.

The shared token grants full workspace access, including backups. Rotate it by updating the environment and restarting, which invalidates existing signatures. There are no individual user roles or a public shipment sharing endpoint. Login cookies expire after 24 hours and are HttpOnly/SameSite=Strict. With TLS terminated at a proxy, ensure the proxy's cookie policy adds Secure where appropriate; direct HTTPS is detected automatically.

## Availability and PWA

Keep the backend running for automatic updates. The PWA is an offline-capable browser client, not a background server. A first online production visit is required to cache the shell; a browser update prompt applies new service-worker assets. Remote PWA installation requires a secure context (HTTPS); loopback is allowed for local development. Browser notifications currently require the app to be open. Web Push is intentionally not claimed.

## Recovery

If a provider fails, cached shipment state remains intact and the error is displayed separately. Missing credentials/manual/verification/budget blocks stop futile scheduling until configuration changes or manual action. Other failures use bounded backoff and persistent provider circuits. A request interrupted by process exit is counted conservatively as a failed reservation on restart. If the backend is unreachable, browser writes remain queued and visible.

If the browser reports conflicts, export pending changes before clearing site data. Reapplying a conflict explicitly replaces only the submitted user fields against the latest server version. Restore/import in the current browser is blocked while there are unsynchronized changes.
