# Architecture

## Persistence and ownership

SQLite is authoritative. Node 24's built-in `node:sqlite` owns a single WAL-mode connection with foreign keys, a busy timeout, and numbered transactional migrations. Drizzle declares the indexed parcel schema and performs typed proxy-backed dashboard reads; repository writes use parameter-bound SQLite statements. This avoids a native-addon compiler requirement while retaining Drizzle's typed query interface.

`parcels` stores indexed identity/status/archive/due-time columns plus validated domain JSON for extensible metadata. `tracking_events` separately stores immutable event payloads with a per-parcel/provider fingerprint uniqueness constraint. Additional tables hold provider health, usage reservations, deduplicated notifications, application settings, and migration versions. The database never holds API keys.

SQLite transactions atomically apply tracking results, deduplicate events, and record transitions. Shipment state and provider errors are separate. Existing events survive errors, refreshes, and archiving. Tracking identity cannot change on an existing parcel, so history cannot silently migrate to another shipment. Changing tracking mode resets the displayed current result while preserving explicitly sourced history.

## Request path

1. Fastify authenticates, enforces Host/Origin policy and rate limits, then validates input through shared Zod schemas.
2. Parcel creation persists before an initial retrieval is attempted. Without eligible APIs, it remains UNKNOWN and available for manual management.
3. The engine filters configured, enabled, capable providers by parcel mode. A mock provider only accepts parcels explicitly saved as mock. Biteship requires a separate order-generated ID.
4. A per-parcel in-flight promise suppresses duplicate refreshes; provider promise chains limit concurrency to one each.
5. An immediate SQLite transaction reserves request count and estimated cost against global and provider day/month limits before dispatch. UTC calendar periods define accounting windows. Pending reservations count against caps; a restart marks them interrupted failures and retains estimated cost.
6. Provider responses are validated and normalized conservatively. Original statuses and descriptions remain available. Empty histories are rejected as tracking success. No arbitrary user-supplied outbound URLs are accepted.
7. Failure leaves the last valid state untouched. Authentication persists a pause; repeated failures open the circuit; Retry-After is respected for HTTP adapters. Klik Resi's official SDK does not expose response headers, so its 429 path uses a conservative 60-second minimum. A second paid provider is used only if fallback and budgets allow it.

The cache is the stored last valid result: page loads only read it, never call tracking APIs. Manual refreshes enforce the configurable cooldown. Network calls time out (20 seconds for direct adapters, SDK's own 30 seconds for Klik Resi).

## Durable scheduling

`next_refresh_at` and failure counts are stored with each parcel. A lightweight 15-second timer selects due active rows; no external queue or Redis is needed. The default interval is four hours, with up to one-hour polling after an actual OUT_FOR_DELIVERY status. Terminal and archived parcels are excluded. Failures receive bounded exponential backoff, respecting longer upstream retry delays. Authentication, missing verification, no-provider/manual, and budget blocks require configuration change or user action rather than repeated futile polling. Saving settings reschedules eligible rows. Restart recovery retains already-due timestamps and resumes jobs.

The scheduler and engine drain on graceful shutdown. SIGKILL/process loss leaves reservations and due timestamps for conservative recovery. This design supports one backend process per data directory, not horizontal replicas.

## Offline synchronization

IndexedDB contains a cached dashboard, cached settings, mutation queue, and browser-notification receipt IDs. Every edit is queued before a network attempt. Optimistic parcel overlays keep pending fields visible over new snapshots. Creates carry stable UUIDs and are idempotent on replay; duplicates use `(carrier_code, tracking_number)`. Edits/deletes carry expected parcel versions.

Queue processing is ordered. An accepted mutation updates subsequent queued versions for that same parcel; a conflicting parcel is paused while other parcels may sync. The UI exposes the full edit and error, export, explicit reapply, and discard actions. A conflict is never treated as success. The backend re-reads the current parcel after provider retrieval so concurrent user metadata is retained.

No API responses or credentials enter service-worker Cache Storage. The production worker precaches the app shell and assets; API requests remain network-only. Offline shell access requires at least one successful production visit and service-worker activation.

## Notifications

Only meaningful transitions into subscribed statuses create notification history. Stable identifiers combine parcel, previous/new status, and latest event fingerprint. Refreshing unchanged data produces no notice. The browser atomically claims notification IDs in IndexedDB, preventing duplicate delivery across tabs; first load establishes a baseline rather than notifying about historic records. Mock notices explicitly say synthetic. Browser permission is requested from Settings, after a user action.

## Security and data portability

Credentials are backend environment variables; the browser sees only configured/not-configured flags. Fastify applies security headers/CSP and request validation. Localhost mode rejects untrusted Host headers, protecting unauthenticated local data against DNS rebinding. Mutations with an Origin must match the serving origin or the fixed localhost development port. The app accepts no custom courier URLs or custom provider base URL. Request logs are disabled to avoid accidental shipment/credential logging.

Non-loopback binds require a long access token. Login issues a signed, expiring, HttpOnly SameSite=Strict cookie; authorization headers also support local scripts. No tracking data is exposed by the health/session endpoints. Put remote deployments behind HTTPS.

JSON merge import validates all records before mutation. SQLite backup uses the online backup API for WAL consistency. Restore reads an uploaded database read-only, checks integrity/version and rejects triggers/views, validates canonical records, then replaces records in a transaction without executing uploaded schema. The prior snapshot is returned to the browser for undo download. Browser pending changes block restore/import in that browser; coordinate maintenance with any other devices before restoring.
