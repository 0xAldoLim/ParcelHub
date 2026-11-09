import { afterEach, it, expect } from 'vitest';
import { Store } from '../apps/server/src/persistence/database';
import { TrackingEngine } from '../apps/server/src/tracking/engine';
import { Scheduler } from '../apps/server/src/scheduler/scheduler';
import { ProviderError } from '../apps/server/src/providers/types';
import { parcelInput } from '../packages/shared/src/index';
import { tempDirectory, cleanup, fakeProvider, result } from './helpers';
const stores: Store[] = [];
function setup() {
  const store = new Store(tempDirectory());
  stores.push(store);
  const s = store.settings();
  s.allowPaid = true;
  s.providers.find((p) => p.id === 'rajaongkir')!.enabled = true;
  store.saveSettings(s);
  return store;
}
afterEach(() => {
  for (const store of stores.splice(0)) {
    store.close();
    cleanup(store.directory);
  }
});
const input = () => parcelInput.parse({ trackingNumber: 'TEST123456', carrierCode: 'jne' });
it('preserves valid tracking on errors, deduplicates events and notifications', async () => {
  const store = setup();
  const p = store.create(input());
  let fail = false;
  const now = new Date();
  const provider = fakeProvider('klikresi', async (p, n) => {
    if (fail) throw new ProviderError('UPSTREAM', 'temporary error');
    return result(p, n, 'OUT_FOR_DELIVERY');
  });
  const engine = new TrackingEngine(store, [provider], () => now);
  await engine.refresh(p.id);
  await engine.refresh(p.id);
  expect(store.get(p.id)?.events).toHaveLength(1);
  expect(store.notices()).toHaveLength(1);
  fail = true;
  await engine.refresh(p.id);
  const cached = store.get(p.id)!;
  expect(cached.status).toBe('OUT_FOR_DELIVERY');
  expect(cached.error).toBe('temporary error');
  expect(cached.lastSuccessfulRefresh).toBe(now.toISOString());
  expect(cached.events).toHaveLength(1);
});
it('only uses paid fallback when explicitly enabled and accounts for every attempt', async () => {
  const store = setup();
  const p = store.create(input());
  let secondCalls = 0;
  const first = fakeProvider('klikresi', async () => {
    throw new ProviderError('UPSTREAM', 'first failed');
  });
  const second = fakeProvider('rajaongkir', async (p, n) => {
    secondCalls++;
    return result(p, n, 'IN_TRANSIT', 'rajaongkir');
  });
  const engine = new TrackingEngine(store, [first, second]);
  await engine.refresh(p.id);
  expect(secondCalls).toBe(0);
  const settings = store.settings();
  settings.allowFallback = true;
  store.saveSettings(settings);
  await engine.refresh(p.id);
  expect(secondCalls).toBe(1);
  expect(store.get(p.id)?.providerId).toBe('rajaongkir');
  expect(engine.usage().month).toBe(3);
  expect(engine.usage().failed).toBe(2);
});
it('enforces real-call disablement, global caps, provider caps and spend before dispatch', async () => {
  const store = setup();
  const p = store.create(input());
  let calls = 0;
  const engine = new TrackingEngine(store, [
    fakeProvider('klikresi', async (p, n) => {
      calls++;
      return result(p, n);
    }),
  ]);
  for (const patch of [
    { allowPaid: false },
    { allowPaid: true, dailyCap: 0 },
    { dailyCap: 100, monthlyCap: 0 },
    { monthlyCap: 100, monthlyBudget: 0 },
  ]) {
    store.saveSettings({ ...store.settings(), ...patch });
    await engine.refresh(p.id);
    expect(store.get(p.id)?.errorCategory).toBe('BUDGET');
  }
  expect(calls).toBe(0);
  const s = store.settings();
  s.monthlyBudget = 100;
  s.providers[0].dailyCap = 1;
  store.saveSettings(s);
  await engine.refresh(p.id);
  await engine.refresh(p.id);
  expect(calls).toBe(1);
  expect(engine.usage().estimatedCost).toBe(15);
});
it('deduplicates concurrent parcel refreshes and serializes provider requests', async () => {
  const store = setup();
  const p = store.create(input()),
    p2 = store.create({ ...input(), trackingNumber: 'SECOND123' });
  let active = 0,
    max = 0,
    calls = 0;
  const engine = new TrackingEngine(store, [
    fakeProvider('klikresi', async (p, n) => {
      calls++;
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 20));
      active--;
      return result(p, n);
    }),
  ]);
  await Promise.all([engine.refresh(p.id), engine.refresh(p.id), engine.refresh(p2.id)]);
  expect(calls).toBe(2);
  expect(max).toBe(1);
});
it('persists authentication pauses until explicit reset', async () => {
  const store = setup();
  const p = store.create(input());
  let calls = 0;
  const engine = new TrackingEngine(store, [
    fakeProvider('klikresi', async () => {
      calls++;
      throw new ProviderError('AUTH', 'invalid key');
    }),
  ]);
  await engine.refresh(p.id);
  await engine.refresh(p.id);
  expect(calls).toBe(1);
  expect(store.state('klikresi').disabled_reason).toBeTruthy();
  expect(store.get(p.id)?.nextRefreshAt).toBeNull();
});
it('honors rate-limit retry-after and opens a persistent circuit', async () => {
  const store = setup();
  const p = store.create(input());
  const now = new Date('2026-01-01T00:00:00Z');
  const engine = new TrackingEngine(
    store,
    [
      fakeProvider('klikresi', async () => {
        throw new ProviderError('RATE_LIMIT', 'wait', 900000);
      }),
    ],
    () => now,
  );
  await engine.refresh(p.id);
  expect(store.get(p.id)?.nextRefreshAt).toBe('2026-01-01T00:15:00.000Z');
  expect(store.state('klikresi').open_until).toBe('2026-01-01T00:15:00.000Z');
});
it('recovers due scheduler jobs after restart and stops delivered/archived polling', async () => {
  const store = setup();
  const now = new Date('2026-01-01T12:00:00Z');
  const due = store.create(input(), '2026-01-01T01:00:00.000Z'),
    delivered = store.create({ ...input(), trackingNumber: 'DONE1234' }),
    archived = store.create({ ...input(), trackingNumber: 'ARCH1234' });
  delivered.status = 'DELIVERED';
  store.put(delivered);
  archived.archivedAt = now.toISOString();
  store.put(archived);
  let calls = 0;
  const engine = new TrackingEngine(
    store,
    [
      fakeProvider('klikresi', async (p, n) => {
        calls++;
        return result(p, n, 'DELIVERED');
      }),
    ],
    () => now,
  );
  const scheduler = new Scheduler(engine);
  scheduler.recover();
  await scheduler.tick();
  expect(calls).toBe(1);
  expect(store.get(due.id)?.status).toBe('DELIVERED');
  expect(store.get(due.id)?.nextRefreshAt).toBeNull();
  await scheduler.tick();
  expect(calls).toBe(1);
});
it('advances deterministic mock events without contacting an external provider', async () => {
  const store = setup();
  const now = new Date('2026-01-01T00:00:00Z');
  const p = store.create({ ...input(), trackingMode: 'mock' }, now.toISOString());
  const engine = new TrackingEngine(store, undefined, () => now);
  await engine.refresh(p.id);
  expect(store.get(p.id)?.status).toBe('PENDING');
  now.setTime(now.getTime() + 180000);
  await engine.refresh(p.id);
  expect(store.get(p.id)?.status).toBe('OUT_FOR_DELIVERY');
  expect(store.get(p.id)?.events).toHaveLength(4);
  now.setTime(now.getTime() + 60000);
  await engine.refresh(p.id);
  expect(store.get(p.id)?.status).toBe('DELIVERED');
  expect(store.get(p.id)?.nextRefreshAt).toBeNull();
});
