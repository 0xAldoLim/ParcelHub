import { afterEach, it, expect, vi } from 'vitest';
import { KlikresiProvider, RajaongkirProvider, BiteshipProvider } from '../apps/server/src/providers/real';
import { requestJson } from '../apps/server/src/providers/types';
import { Store } from '../apps/server/src/persistence/database';
import { parcelInput } from '../packages/shared/src/index';
import { tempDirectory, cleanup } from './helpers';
const stores: Store[] = [];
function parcel() {
  const store = new Store(tempDirectory());
  stores.push(store);
  return store.create(
    parcelInput.parse({ trackingNumber: 'FIXTURE12345', carrierCode: 'jne', phoneVerification: '12345' }),
  );
}
afterEach(() => {
  vi.unstubAllGlobals();
  for (const store of stores.splice(0)) {
    store.close();
    cleanup(store.directory);
  }
});
it('uses the official Klik Resi SDK contract and maps ID Express to ide', async () => {
  const p = parcel();
  p.carrierCode = 'idexpress';
  const fetcher = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          data: {
            status: 'Delivered',
            origin: { contactName: 'Sender', address: 'Bandung' },
            destination: { contactName: 'Recipient', address: 'Jakarta' },
            histories: [
              {
                status: 'Delivered',
                message: 'Paket diterima oleh penerima',
                date: '2026-01-01T14:00:00+07:00',
              },
            ],
          },
        }),
        { status: 200 },
      ),
  );
  vi.stubGlobal('fetch', fetcher);
  const provider = new KlikresiProvider('fixture-key');
  const r = await provider.track(p, new Date());
  expect(String(fetcher.mock.calls[0][0])).toContain('/couriers/ide');
  expect(String(fetcher.mock.calls[0][0])).toContain('number=12345');
  expect(r.status).toBe('DELIVERED');
  expect(r.events[0].originalDescription).toBe('Paket diterima oleh penerima');
  expect(r.events[0].timestamp).toBe('2026-01-01T07:00:00.000Z');
  expect(r.location).toBeNull();
});
it('sends RajaOngkir verification as documented and preserves unknown manifest codes', async () => {
  const p = parcel();
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    expect(new URLSearchParams(String(init?.body)).get('last_phone_number')).toBe('12345');
    expect((init?.headers as Record<string, string>).key).toBe('fixture-key');
    return new Response(
      JSON.stringify({
        meta: { code: 200 },
        data: {
          summary: {
            waybill_number: p.trackingNumber,
            status: 'ON PROCESS',
            origin: 'Bandung',
            destination: 'Jakarta',
            service_code: 'REG',
          },
          manifest: [
            {
              manifest_code: 'UNRECOGNIZED',
              manifest_description: 'Diproses di pusat sortir',
              manifest_date: '2026-01-01',
              manifest_time: '15:30:00',
              city_name: 'Jakarta',
            },
          ],
        },
      }),
    );
  });
  vi.stubGlobal('fetch', fetcher);
  const r = await new RajaongkirProvider('fixture-key').track(p, new Date());
  expect(r.status).toBe('IN_TRANSIT');
  expect(r.events[0].type).toBe('UNKNOWN');
  expect(r.events[0].timestamp).toBe('2026-01-01T08:30:00.000Z');
});
it('refuses missing phone validation without making a request', async () => {
  const p = parcel();
  p.phoneVerification = '';
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await expect(new RajaongkirProvider('fixture-key').track(p, new Date())).rejects.toMatchObject({
    category: 'VERIFICATION_REQUIRED',
  });
  p.carrierCode = 'idexpress';
  await expect(new KlikresiProvider('fixture-key').track(p, new Date())).rejects.toMatchObject({
    category: 'VERIFICATION_REQUIRED',
  });
  expect(fetcher).not.toHaveBeenCalled();
});
it('never treats an arbitrary external AWB as a Biteship tracking ID', async () => {
  const p = parcel();
  const provider = new BiteshipProvider('fixture-key');
  expect(provider.supports(p)).toBe(false);
  await expect(provider.track(p, new Date())).rejects.toMatchObject({ category: 'MANUAL' });
  p.providerTrackingId = 'documented_tracking_id';
  const fetcher = vi.fn(async (url: string) => {
    expect(url).toBe('https://api.biteship.com/v1/trackings/documented_tracking_id');
    return new Response(
      JSON.stringify({
        success: true,
        waybill_id: p.trackingNumber,
        courier: { company: 'jne' },
        status: 'delivered',
        history: [
          { note: 'Delivered to receiver', updated_at: '2026-01-01T14:00:00+07:00', status: 'delivered' },
        ],
      }),
    );
  });
  vi.stubGlobal('fetch', fetcher);
  const r = await provider.track(p, new Date());
  expect(r.status).toBe('DELIVERED');
  expect(r.events[0].originalDescription).toBe('Delivered to receiver');
});
it('rejects empty/mismatched real responses rather than reporting tracking success', async () => {
  const p = parcel();
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(
        JSON.stringify({
          meta: { code: 200 },
          data: { summary: { waybill_number: 'WRONG123', status: 'DELIVERED' }, manifest: [] },
        }),
      ),
  );
  await expect(new RajaongkirProvider('fixture-key').track(p, new Date())).rejects.toMatchObject({
    category: 'INVALID_RESPONSE',
  });
});
it('honors Retry-After headers and classifies authentication without leaking server bodies', async () => {
  vi.stubGlobal(
    'fetch',
    async () => new Response('secret provider body', { status: 429, headers: { 'retry-after': '120' } }),
  );
  await expect(requestJson('https://api.biteship.com/v1/trackings/test')).rejects.toMatchObject({
    category: 'RATE_LIMIT',
    retryAfterMs: 120000,
  });
  vi.stubGlobal('fetch', async () => new Response('sensitive details', { status: 401 }));
  await expect(requestJson('https://api.biteship.com/v1/trackings/test')).rejects.toMatchObject({
    category: 'AUTH',
  });
});
