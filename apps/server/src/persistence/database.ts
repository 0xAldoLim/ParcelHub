import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import {
  defaultSettings,
  type Parcel,
  type ParcelInput,
  type Settings,
  type TrackingEvent,
  type Notice,
} from '../../../../packages/shared/src/index.js';
import { parcelsTable } from './schema.js';
import { migrations } from './migrations.js';

export class Store {
  maintenance = false;
  db: DatabaseSync;
  constructor(
    public directory: string,
    public filename = join(directory, 'parcelhub.sqlite'),
  ) {
    mkdirSync(directory, { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL)',
    );
    for (const m of migrations)
      if (!this.db.prepare('SELECT 1 FROM schema_migrations WHERE version=?').get(m.version))
        this.transaction(() => {
          this.db.exec(m.sql);
          this.db
            .prepare('INSERT INTO schema_migrations VALUES(?,?)')
            .run(m.version, new Date().toISOString());
        });
    this.db
      .prepare('INSERT OR IGNORE INTO application_settings VALUES(1,?)')
      .run(JSON.stringify(defaultSettings));
    // A process terminated during a request leaves a reservation. Count it as failed and retain its cost conservatively.
    this.db
      .prepare("UPDATE api_usage SET success=0,error_category='INTERRUPTED' WHERE success IS NULL")
      .run();
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      this.db.exec('COMMIT');
      return value;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  settings(): Settings {
    return JSON.parse(
      this.db.prepare('SELECT payload FROM application_settings WHERE id=1').get()!.payload as string,
    );
  }
  saveSettings(s: Settings) {
    this.db.prepare('UPDATE application_settings SET payload=? WHERE id=1').run(JSON.stringify(s));
  }
  hydrate(payload: string): Parcel {
    const p = JSON.parse(payload) as Parcel;
    p.events = this.db
      .prepare('SELECT payload FROM tracking_events WHERE parcel_id=? ORDER BY event_timestamp DESC,id DESC')
      .all(p.id)
      .map((r) => JSON.parse(r.payload as string));
    return p;
  }
  list(): Parcel[] {
    return this.db
      .prepare('SELECT payload FROM parcels ORDER BY rowid DESC')
      .all()
      .map((r) => this.hydrate(r.payload as string));
  }
  async listTyped(): Promise<Parcel[]> {
    const orm = drizzle(async (sql, params, method) => {
      const stmt = this.db.prepare(sql);
      stmt.setReturnArrays(true);
      if (method === 'run') {
        stmt.run(...params);
        return { rows: [] };
      }
      return { rows: stmt.all(...params) };
    });
    const rows = await orm.select({ payload: parcelsTable.payload }).from(parcelsTable);
    return rows.reverse().map((r) => this.hydrate(r.payload));
  }
  get(id: string): Parcel | undefined {
    const row = this.db.prepare('SELECT payload FROM parcels WHERE id=?').get(id);
    return row ? this.hydrate(row.payload as string) : undefined;
  }
  find(number: string, carrier: string): Parcel | undefined {
    const row = this.db
      .prepare('SELECT payload FROM parcels WHERE tracking_number=? AND carrier_code=?')
      .get(number, carrier);
    return row ? this.hydrate(row.payload as string) : undefined;
  }
  create(input: ParcelInput, now = new Date().toISOString()): Parcel {
    const p: Parcel = {
      ...input,
      id: input.id ?? randomUUID(),
      status: 'UNKNOWN',
      rawStatus: '',
      location: null,
      origin: null,
      destination: null,
      service: null,
      deliveredAt: null,
      providerId: null,
      lastSuccessfulRefresh: null,
      lastRefreshAttempt: null,
      lastStatusChange: null,
      error: null,
      errorCategory: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      version: 1,
      nextRefreshAt: now,
      failures: 0,
      events: [],
    };
    this.put(p, true);
    return p;
  }
  put(p: Parcel, insert = false) {
    const { events, ...payload } = p;
    const values = [
      p.trackingNumber,
      p.carrierCode,
      p.status,
      p.archivedAt,
      p.nextRefreshAt,
      JSON.stringify({ ...payload, events: [] }),
      p.version,
      p.id,
    ];
    if (insert)
      this.db
        .prepare(
          'INSERT INTO parcels(tracking_number,carrier_code,normalized_status,archived_at,next_refresh_at,payload,version,id) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(...values);
    else
      this.db
        .prepare(
          'UPDATE parcels SET tracking_number=?,carrier_code=?,normalized_status=?,archived_at=?,next_refresh_at=?,payload=?,version=? WHERE id=?',
        )
        .run(...values);
    for (const e of events) this.addEvent(p.id, e);
  }
  addEvent(id: string, e: TrackingEvent) {
    this.db
      .prepare(
        'INSERT OR IGNORE INTO tracking_events(id,parcel_id,provider_id,event_fingerprint,event_timestamp,payload) VALUES(?,?,?,?,?,?)',
      )
      .run(e.id, id, e.providerId, e.id, e.timestamp, JSON.stringify(e));
  }
  remove(id: string) {
    this.db.prepare('DELETE FROM parcels WHERE id=?').run(id);
  }
  addNotice(n: Notice): boolean {
    return (
      this.db
        .prepare('INSERT OR IGNORE INTO notification_history VALUES(?,?,?,?,?)')
        .run(n.id, n.parcelId, n.id, JSON.stringify(n), n.createdAt).changes > 0
    );
  }
  notices(): Notice[] {
    return this.db
      .prepare('SELECT payload FROM notification_history ORDER BY created_at DESC LIMIT 100')
      .all()
      .map((r) => JSON.parse(r.payload as string));
  }
  state(id: string) {
    this.db.prepare('INSERT OR IGNORE INTO providers(id) VALUES(?)').run(id);
    return this.db.prepare('SELECT * FROM providers WHERE id=?').get(id)! as {
      id: string;
      disabled_reason: string | null;
      failures: number;
      open_until: string | null;
    };
  }
  setState(id: string, reason: string | null, failures: number, until: string | null) {
    this.db
      .prepare(
        'INSERT INTO providers VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET disabled_reason=excluded.disabled_reason,failures=excluded.failures,open_until=excluded.open_until',
      )
      .run(id, reason, failures, until);
  }
  reserve(id: string, parcelId: string, cost: number, now: string) {
    const key = randomUUID();
    this.db.prepare('INSERT INTO api_usage VALUES(?,?,?,?,NULL,?,NULL)').run(key, id, parcelId, now, cost);
    return key;
  }
  finishUsage(id: string, success: boolean, cost: number, category: string | null) {
    this.db
      .prepare('UPDATE api_usage SET success=?,estimated_cost=?,error_category=? WHERE id=?')
      .run(success ? 1 : 0, cost, category, id);
  }
  async backup(): Promise<Buffer> {
    const filename = join(this.directory, `backup-${randomUUID()}.sqlite`);
    try {
      await backup(this.db, filename);
      return readFileSync(filename);
    } finally {
      try {
        unlinkSync(filename);
      } catch {
        /* already absent */
      }
    }
  }
  readBackup(buffer: Buffer): {
    parcels: unknown[];
    settings: unknown;
    usage: Record<string, unknown>[];
    notices: unknown[];
    states: Record<string, unknown>[];
  } {
    const filename = join(this.directory, `restore-${randomUUID()}.sqlite`);
    writeFileSync(filename, buffer);
    let candidate: DatabaseSync | undefined;
    try {
      candidate = new DatabaseSync(filename, { readOnly: true });
      const result = candidate.prepare('PRAGMA integrity_check').get();
      if (result?.integrity_check !== 'ok') throw new Error('Invalid SQLite integrity');
      if (candidate.prepare("SELECT 1 FROM sqlite_master WHERE type IN ('trigger','view') LIMIT 1").get())
        throw new Error('Unexpected database objects');
      const version = candidate.prepare('SELECT MAX(version) AS v FROM schema_migrations').get()?.v;
      if (version !== migrations.at(-1)!.version) throw new Error('Unsupported database version');
      const c = candidate;
      const parcels = c
        .prepare('SELECT payload FROM parcels')
        .all()
        .map((r) => {
          const p = JSON.parse(r.payload as string);
          p.events = c
            .prepare('SELECT payload FROM tracking_events WHERE parcel_id=?')
            .all(p.id)
            .map((e) => JSON.parse(e.payload as string));
          return p;
        });
      return {
        parcels,
        settings: JSON.parse(
          c.prepare('SELECT payload FROM application_settings WHERE id=1').get()!.payload as string,
        ),
        usage: c.prepare('SELECT * FROM api_usage').all(),
        notices: c
          .prepare('SELECT payload FROM notification_history')
          .all()
          .map((n) => JSON.parse(n.payload as string)),
        states: c.prepare('SELECT * FROM providers').all(),
      };
    } finally {
      candidate?.close();
      unlinkSync(filename);
    }
  }
  close() {
    this.db.close();
  }
}
