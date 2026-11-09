import { afterEach, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../apps/server/src/app';
import { type Parcel, parcelInput } from '../packages/shared/src/index';
import { tempDirectory, cleanup } from './helpers';
let current: Awaited<ReturnType<typeof createApp>> | undefined;
const directories: string[] = [];
async function setup() {
  const directory = tempDirectory();
  directories.push(directory);
  current = await createApp({ directory, scheduler: false });
  return current;
}
afterEach(async () => {
  await current?.app.close();
  current = undefined;
  directories.splice(0).forEach(cleanup);
});
const body = {
  trackingNumber: 'JX123456789',
  carrierCode: 'jnt',
  nickname: 'Desk lamp',
  trackingMode: 'mock',
};
describe('persistent API', () => {
  it('migrates, creates, deduplicates, edits, protects conflicts and deletes', async () => {
    const { app, store } = await setup();
    expect(store.db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()?.n).toBe(1);
    const created = await app.inject({ method: 'POST', url: '/api/parcels', payload: body });
    expect(created.statusCode).toBe(201);
    const p = created.json<Parcel>();
    expect(p.status).toBe('PENDING');
    expect(p.providerId).toBe('mock');
    expect(p.events[0].description).toContain('SYNTHETIC');
    expect((await app.inject({ method: 'POST', url: '/api/parcels', payload: body })).statusCode).toBe(409);
    const list = await app.inject('/api/parcels');
    expect(list.json().parcels).toHaveLength(1);
    const edit = await app.inject({
      method: 'PATCH',
      url: `/api/parcels/${p.id}`,
      payload: { notes: 'Keep at reception', expectedVersion: p.version },
    });
    expect(edit.statusCode).toBe(200);
    expect(edit.json().notes).toBe('Keep at reception');
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/parcels/${p.id}`,
          payload: { notes: 'stale', expectedVersion: p.version },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/parcels/${p.id}?version=${edit.json().version}` }))
        .statusCode,
    ).toBe(200);
    expect(store.list()).toHaveLength(0);
    expect(store.db.prepare('SELECT COUNT(*) AS n FROM tracking_events').get()?.n).toBe(0);
  });
  it('retains parcels and history across an actual database close/reopen', async () => {
    const { app, store } = await setup();
    const directory = store.directory;
    const r = await app.inject({ method: 'POST', url: '/api/parcels', payload: body });
    const p = r.json<Parcel>();
    await app.close();
    current = await createApp({ directory, scheduler: false });
    expect((await current.app.inject(`/api/parcels/${p.id}`)).json().events).toHaveLength(1);
    expect(current.store.list()[0].nickname).toBe('Desk lamp');
  });
  it('makes creation idempotent for offline replay and never tracks without credentials', async () => {
    const { app, store } = await setup();
    const input = { ...body, id: randomUUID(), trackingMode: 'auto' };
    const r = await app.inject({ method: 'POST', url: '/api/parcels', payload: input });
    expect(r.json().status).toBe('UNKNOWN');
    expect(r.json().lastSuccessfulRefresh).toBeNull();
    expect(r.json().events).toEqual([]);
    expect(r.json().errorCategory).toBe('MANUAL');
    expect((await app.inject({ method: 'POST', url: '/api/parcels', payload: input })).statusCode).toBe(200);
    expect(store.list()).toHaveLength(1);
    expect(store.db.prepare('SELECT COUNT(*) AS n FROM api_usage').get()?.n).toBe(0);
  });
  it('archives and restores while preserving events', async () => {
    const { app, store } = await setup();
    const r = (await app.inject({ method: 'POST', url: '/api/parcels', payload: body })).json<Parcel>();
    let p = (
      await app.inject({
        method: 'PATCH',
        url: `/api/parcels/${r.id}`,
        payload: { expectedVersion: r.version, archivedAt: new Date().toISOString() },
      })
    ).json<Parcel>();
    expect(p.nextRefreshAt).toBeNull();
    expect(p.nickname).toBe('Desk lamp');
    expect(p.trackingMode).toBe('mock');
    expect(p.status).toBe(r.status);
    p = (
      await app.inject({
        method: 'PATCH',
        url: `/api/parcels/${p.id}`,
        payload: { expectedVersion: p.version, archivedAt: null },
      })
    ).json<Parcel>();
    expect(p.archivedAt).toBeNull();
    expect(store.get(p.id)?.events).toHaveLength(1);
    expect(p.nextRefreshAt).not.toBeNull();
  });
  it('backs up/restores canonical SQLite data and rejects corrupt backups without data loss', async () => {
    const { app, store } = await setup();
    await app.inject({ method: 'POST', url: '/api/parcels', payload: body });
    const backup = await app.inject('/api/backup');
    expect(backup.statusCode).toBe(200);
    expect(backup.rawPayload.subarray(0, 15).toString()).toBe('SQLite format 3');
    store.create(parcelInput.parse({ trackingNumber: 'EXTRA123', carrierCode: 'jne' }));
    expect(store.list()).toHaveLength(2);
    const restore = await app.inject({
      method: 'POST',
      url: '/api/restore',
      headers: { 'content-type': 'application/octet-stream', 'x-confirm-restore': 'replace-all' },
      payload: backup.rawPayload,
    });
    expect(restore.statusCode).toBe(200);
    expect(restore.json().restored).toBe(1);
    expect(restore.json().previousBackup).toBeTruthy();
    expect(store.list()).toHaveLength(1);
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/restore',
      headers: { 'content-type': 'application/octet-stream', 'x-confirm-restore': 'replace-all' },
      payload: Buffer.from('invalid'),
    });
    expect(invalid.statusCode).toBe(400);
    expect(store.list()).toHaveLength(1);
  });
  it('validates all imported records before mutation and skips duplicate JSON records', async () => {
    const { app, store } = await setup();
    await app.inject({ method: 'POST', url: '/api/parcels', payload: body });
    const exported = (await app.inject('/api/export')).json();
    expect((await app.inject({ method: 'POST', url: '/api/import', payload: exported })).json()).toEqual({
      imported: 0,
      skipped: 1,
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/import',
          payload: { format: 'parcelhub-v1', parcels: [...exported.parcels, { bad: true }] },
        })
      ).statusCode,
    ).toBe(400);
    expect(store.list()).toHaveLength(1);
  });
  it('guards host headers, cross-origin mutations, validation and rate limits', async () => {
    const { app } = await setup();
    expect((await app.inject({ url: '/api/parcels', headers: { host: 'evil.example' } })).statusCode).toBe(
      403,
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/parcels',
          headers: { origin: 'https://evil.example' },
          payload: body,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/parcels',
          payload: { ...body, trackingNumber: 'x'.repeat(65) },
        })
      ).statusCode,
    ).toBe(400);
    for (let i = 0; i < 10; i++)
      await app.inject({ method: 'POST', url: '/api/session', payload: { token: 'bad' } });
    expect(
      (await app.inject({ method: 'POST', url: '/api/session', payload: { token: 'bad' } })).statusCode,
    ).toBe(429);
  });
  it('requires authentication for non-loopback deployments', async () => {
    const directory = tempDirectory();
    directories.push(directory);
    await expect(createApp({ directory, host: '0.0.0.0', scheduler: false })).rejects.toThrow(
      'requires PARCELHUB_AUTH_TOKEN',
    );
    current = await createApp({
      directory,
      host: '0.0.0.0',
      token: 'a-long-private-access-token-for-testing',
      scheduler: false,
    });
    expect((await current.app.inject('/api/parcels')).statusCode).toBe(401);
    expect((await current.app.inject('/api/health')).statusCode).toBe(200);
    const login = await current.app.inject({
      method: 'POST',
      url: '/api/session',
      payload: { token: 'a-long-private-access-token-for-testing' },
    });
    expect(login.statusCode).toBe(200);
    const cookie = String(login.headers['set-cookie']).split(';')[0];
    expect((await current.app.inject({ url: '/api/parcels', headers: { cookie } })).statusCode).toBe(200);
  });
});
