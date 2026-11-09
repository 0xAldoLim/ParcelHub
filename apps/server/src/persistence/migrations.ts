export const migrations = [
  {
    version: 1,
    sql: `
CREATE TABLE parcels (id TEXT PRIMARY KEY, tracking_number TEXT NOT NULL, carrier_code TEXT NOT NULL, normalized_status TEXT NOT NULL, archived_at TEXT, next_refresh_at TEXT, payload TEXT NOT NULL CHECK(json_valid(payload)), version INTEGER NOT NULL, UNIQUE(carrier_code,tracking_number));
CREATE INDEX parcels_due ON parcels(next_refresh_at) WHERE archived_at IS NULL;
CREATE INDEX parcels_status ON parcels(normalized_status,archived_at);
CREATE TABLE tracking_events (id TEXT NOT NULL, parcel_id TEXT NOT NULL REFERENCES parcels(id) ON DELETE CASCADE, provider_id TEXT NOT NULL, event_fingerprint TEXT NOT NULL, event_timestamp TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)), PRIMARY KEY(parcel_id,event_fingerprint));
CREATE INDEX events_parcel_time ON tracking_events(parcel_id,event_timestamp);
CREATE TABLE providers (id TEXT PRIMARY KEY, disabled_reason TEXT, failures INTEGER NOT NULL DEFAULT 0, open_until TEXT);
CREATE TABLE api_usage (id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, parcel_id TEXT REFERENCES parcels(id) ON DELETE SET NULL, request_time TEXT NOT NULL, success INTEGER, estimated_cost REAL NOT NULL, error_category TEXT);
CREATE INDEX usage_provider_time ON api_usage(provider_id,request_time);
CREATE TABLE notification_history (id TEXT PRIMARY KEY, parcel_id TEXT NOT NULL REFERENCES parcels(id) ON DELETE CASCADE, transition_identifier TEXT NOT NULL UNIQUE, payload TEXT NOT NULL CHECK(json_valid(payload)), created_at TEXT NOT NULL);
CREATE TABLE application_settings (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL CHECK(json_valid(payload)));
`,
  },
];
