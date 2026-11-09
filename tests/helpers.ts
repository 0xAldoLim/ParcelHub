import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep, basename } from 'node:path';
import {
  carriers,
  eventOf,
  type Parcel,
  type TrackingResult,
  type Status,
} from '../packages/shared/src/index';
import type { TrackingProvider } from '../apps/server/src/providers/types';
export function tempDirectory() {
  return mkdtempSync(join(tmpdir(), 'parcelhub-test-'));
}
export function cleanup(directory: string) {
  const absolute = resolve(directory);
  if (!absolute.startsWith(resolve(tmpdir()) + sep) || !basename(absolute).startsWith('parcelhub-test-'))
    throw new Error('Unsafe test cleanup');
  rmSync(absolute, { recursive: true, force: true });
}
export function result(p: Parcel, now: Date, status: Status = 'IN_TRANSIT', id = 'klikresi'): TrackingResult {
  return {
    trackingNumber: p.trackingNumber,
    carrierCode: p.carrierCode,
    status,
    rawStatus: status,
    events: [eventOf(id, now.toISOString(), 'Paket diproses di Jakarta', status, 'Jakarta')],
    location: 'Jakarta',
    origin: 'Bandung',
    destination: 'Jakarta',
    service: 'REG',
    deliveredAt: null,
    providerId: id,
    retrievedAt: now.toISOString(),
  };
}
export function fakeProvider(id = 'klikresi', track?: TrackingProvider['track']): TrackingProvider {
  return {
    id,
    name: id,
    configured: true,
    couriers: carriers.map((c) => c.code),
    externalTracking: true,
    verification: 'TEST FIXTURE',
    supports: (p) => p.trackingMode === 'auto',
    track: track ?? (async (p, now) => result(p, now, 'IN_TRANSIT', id)),
  };
}
