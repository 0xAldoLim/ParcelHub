import { openDB } from 'idb';
import {
  defaultSettings,
  type Parcel,
  type ParcelInput,
  type ParcelEdit,
  type Settings,
} from '../../../../packages/shared/src/index';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public current?: Parcel,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof Blob) ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({ error: 'The request failed.' }));
    if (r.status === 401) window.dispatchEvent(new Event('parcelhub-auth'));
    throw new ApiError(r.status, data.error ?? 'The request failed.', data.current);
  }
  return r.json();
}
const database = openDB('parcelhub-v1', 1, {
  upgrade(db) {
    db.createObjectStore('meta');
    db.createObjectStore('queue', { keyPath: 'id' });
  },
});
export interface Change {
  id: string;
  parcelId: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  body?: ParcelInput | ParcelEdit;
  local: Parcel;
  created: number;
  error?: string;
  conflict?: boolean;
}
export async function cachedParcels(): Promise<Parcel[]> {
  return (await (await database).get('meta', 'parcels')) ?? [];
}
export async function queue(): Promise<Change[]> {
  return ((await (await database).getAll('queue')) as Change[]).sort((a, b) => a.created - b.created);
}
export async function pendingCount() {
  return (await queue()).length;
}
export async function cachedSettings(): Promise<Settings> {
  return (await (await database).get('meta', 'settings')) ?? defaultSettings;
}
export async function saveCachedSettings(settings: Settings) {
  await (await database).put('meta', settings, 'settings');
}
function notify() {
  window.dispatchEvent(new Event('parcelhub-data'));
}
export async function overlay(server: Parcel[]): Promise<Parcel[]> {
  const map = new Map(server.map((p) => [p.id, p]));
  for (const c of await queue()) {
    if (c.method === 'DELETE') map.delete(c.parcelId);
    else map.set(c.parcelId, c.local);
  }
  return [...map.values()];
}
export async function readParcels(): Promise<{ parcels: Parcel[]; online: boolean; pending: Change[] }> {
  const db = await database;
  try {
    await flush();
    const result = await api<{ parcels: Parcel[] }>('/parcels');
    const parcels = await overlay(result.parcels);
    await db.put('meta', parcels, 'parcels');
    return { parcels, online: true, pending: await queue() };
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) throw e;
    return { parcels: await overlay(await cachedParcels()), online: false, pending: await queue() };
  }
}
let flushing: Promise<void> | null = null;
export function flush(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    if (navigator.locks) await navigator.locks.request('parcelhub-sync', doFlush);
    else await doFlush();
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}
async function doFlush() {
  const db = await database;
  const blocked = new Set<string>();
  for (const item of await queue()) {
    const change = (await db.get('queue', item.id)) as Change | undefined;
    if (!change) continue;
    if (change.conflict || blocked.has(change.parcelId)) {
      blocked.add(change.parcelId);
      continue;
    }
    try {
      const current = await api<Parcel | { ok: boolean }>(
        change.method === 'POST'
          ? '/parcels'
          : `/parcels/${change.parcelId}${change.method === 'DELETE' ? `?version=${change.local.version}` : ''}`,
        { method: change.method, body: change.body ? JSON.stringify(change.body) : undefined },
      );
      await db.delete('queue', change.id);
      if ('version' in current) {
        for (const subsequent of await queue()) {
          if (subsequent.parcelId === change.parcelId) {
            subsequent.local.version = current.version;
            if (subsequent.body && subsequent.method === 'PATCH')
              (subsequent.body as ParcelEdit).expectedVersion = current.version;
            await db.put('queue', subsequent);
          }
        }
      }
    } catch (e) {
      if (
        e instanceof ApiError &&
        e.status >= 400 &&
        e.status < 500 &&
        e.status !== 429 &&
        e.status !== 401
      ) {
        change.conflict = true;
        change.error = e.message;
        await db.put('queue', change);
        blocked.add(change.parcelId);
      } else break;
    }
  }
}
export async function enqueue(change: Omit<Change, 'id' | 'created'>) {
  const db = await database;
  const tx = db.transaction(['meta', 'queue'], 'readwrite');
  const created = Math.max(
    Date.now(),
    Number((await tx.objectStore('meta').get('last-queue-order')) ?? 0) + 1,
  );
  await tx.objectStore('meta').put(created, 'last-queue-order');
  await tx.objectStore('queue').put({ ...change, id: crypto.randomUUID(), created });
  await tx.done;
  const parcels = await overlay(await cachedParcels());
  await db.put('meta', parcels, 'parcels');
  notify();
  await flush();
  notify();
}
export function localParcel(input: ParcelInput): Parcel {
  const now = new Date().toISOString();
  return {
    ...input,
    id: input.id ?? crypto.randomUUID(),
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
    nextRefreshAt: null,
    failures: 0,
    events: [],
  };
}
export async function saveParcel(input: ParcelInput, existing?: Parcel) {
  if (existing) {
    const body: ParcelEdit = { ...input, expectedVersion: existing.version };
    await enqueue({
      method: 'PATCH',
      parcelId: existing.id,
      body,
      local: { ...existing, ...input, id: existing.id, updatedAt: new Date().toISOString() },
    });
  } else {
    const p = localParcel(input);
    await enqueue({ method: 'POST', parcelId: p.id, body: { ...input, id: p.id }, local: p });
  }
}
export async function archiveParcel(p: Parcel, archive = true) {
  const archivedAt = archive ? new Date().toISOString() : null;
  await enqueue({
    method: 'PATCH',
    parcelId: p.id,
    body: { archivedAt, expectedVersion: p.version },
    local: { ...p, archivedAt },
  });
}
export async function deleteParcel(p: Parcel) {
  await enqueue({ method: 'DELETE', parcelId: p.id, local: p });
}
export async function resolveChange(id: string, action: 'discard' | 'retry') {
  const db = await database;
  const c = (await db.get('queue', id)) as Change | undefined;
  if (!c) return;
  if (action === 'discard') {
    const snapshot = await api<{ parcels: Parcel[] }>('/parcels');
    await db.delete('queue', id);
    await db.put('meta', await overlay(snapshot.parcels), 'parcels');
  } else {
    if (c.method !== 'POST') {
      const current = await api<Parcel>(`/parcels/${c.parcelId}`);
      c.local.version = current.version;
      if (c.body && c.method === 'PATCH') (c.body as ParcelEdit).expectedVersion = current.version;
    }
    c.conflict = false;
    c.error = undefined;
    await db.put('queue', c);
  }
  notify();
  await flush();
  notify();
}
export async function clearLocalData() {
  const db = await database;
  await db.clear('meta');
  await db.clear('queue');
  notify();
}
export async function claimNotifications(ids: string[]): Promise<string[]> {
  const db = await database;
  const tx = db.transaction('meta', 'readwrite');
  const prior = (await tx.store.get('notified')) as string[] | undefined;
  const known = new Set(prior ?? []);
  const fresh = prior ? ids.filter((id) => !known.has(id)) : [];
  ids.forEach((id) => known.add(id));
  await tx.store.put([...known].slice(-1000), 'notified');
  await tx.done;
  return fresh;
}
export function download(name: string, data: BlobPart, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
