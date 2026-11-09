import { z } from 'zod';
import { Klikresi, ApiError, type CourierCode } from '@klikresi/node-sdk';
import {
  carriers,
  eventOf,
  normalizeStatus,
  type CarrierCode,
  type Parcel,
  type TrackingResult,
} from '../../../../packages/shared/src/index.js';
import { ProviderError, requestJson, type TrackingProvider } from './types.js';

const klikCodes: Record<CarrierCode, CourierCode> = {
  jne: 'jne',
  jnt: 'jnt',
  tiki: 'tiki',
  spx: 'spx',
  sicepat: 'sicepat',
  anteraja: 'anteraja',
  ninja: 'ninja',
  pos: 'pos',
  lion: 'lion',
  idexpress: 'ide',
  sap: 'sap',
  lex: 'lex',
};
const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {};
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const dateString = (v: unknown): string => {
  const d = v instanceof Date ? v : new Date(String(v));
  if (!Number.isFinite(d.getTime()))
    throw new ProviderError('INVALID_RESPONSE', 'Provider returned an invalid event timestamp.', 0, true);
  return d.toISOString();
};
export class KlikresiProvider implements TrackingProvider {
  id = 'klikresi';
  name = 'Klik Resi';
  configured: boolean;
  couriers = carriers.map((c) => c.code);
  externalTracking = true;
  verification =
    'Official SDK verified; live account access and individual couriers await credentials. ID Express requires phone verification.';
  private client: Klikresi | null;
  constructor(key = process.env.KLIKRESI_API_KEY) {
    this.configured = !!key;
    this.client = key ? new Klikresi(key) : null;
  }
  supports(p: Parcel) {
    return p.trackingMode === 'auto' && this.couriers.includes(p.carrierCode);
  }
  async testConnection() {
    if (!this.client)
      throw new ProviderError('AUTH', 'Set KLIKRESI_API_KEY in the backend .env and restart.');
    try {
      await this.client.me.get();
    } catch (e) {
      throw this.classify(e);
    }
  }
  classify(e: unknown): ProviderError {
    if (e instanceof ProviderError) return e;
    if (e instanceof ApiError) {
      if (e.status === 401 || e.status === 403)
        return new ProviderError('AUTH', 'Klik Resi rejected credentials.');
      if (e.status === 429)
        return new ProviderError('RATE_LIMIT', 'Klik Resi is rate limiting requests.', 60000);
      if (e.status === 404) return new ProviderError('NOT_FOUND', 'Tracking number was not found.');
      if (e.status === 400 || e.status === 422)
        return new ProviderError(
          'VERIFICATION_REQUIRED',
          'Check the courier, tracking number, and required phone verification.',
        );
      return new ProviderError('UPSTREAM', 'Klik Resi returned an error.');
    }
    return new ProviderError('NETWORK', 'Klik Resi could not be reached.');
  }
  async track(p: Parcel, now: Date): Promise<TrackingResult> {
    if (!this.client) throw new ProviderError('AUTH', 'Configure KLIKRESI_API_KEY on the server.');
    if (p.carrierCode === 'idexpress' && !p.phoneVerification)
      throw new ProviderError(
        'VERIFICATION_REQUIRED',
        'ID Express requires the recipient phone number. Edit the parcel to provide it.',
      );
    let response: unknown;
    try {
      response = await this.client.tracking.get(
        p.trackingNumber,
        klikCodes[p.carrierCode] as CourierCode,
        p.phoneVerification ? { number: p.phoneVerification } : undefined,
      );
    } catch (e) {
      throw this.classify(e);
    }
    const r = record(response);
    if (!str(r.status) || !Array.isArray(r.histories) || !r.histories.length)
      throw new ProviderError(
        'INVALID_RESPONSE',
        'Klik Resi returned no verifiable tracking history.',
        0,
        true,
      );
    const events = r.histories.map((value) => {
      const h = record(value);
      if (!str(h.message))
        throw new ProviderError('INVALID_RESPONSE', 'Tracking event description is missing.', 0, true);
      return eventOf(
        this.id,
        dateString(h.date),
        String(h.message),
        normalizeStatus(this.id, String(h.status ?? '')),
        str(h.location),
        'Provider timestamp converted to UTC',
      );
    });
    return {
      trackingNumber: p.trackingNumber,
      carrierCode: p.carrierCode,
      status: normalizeStatus(this.id, String(r.status)),
      rawStatus: String(r.status),
      events,
      location: null,
      origin: str(record(r.origin).address),
      destination: str(record(r.destination).address),
      service: null,
      deliveredAt: [...events].reverse().find((e) => e.type === 'DELIVERED')?.timestamp ?? null,
      providerId: this.id,
      retrievedAt: now.toISOString(),
    };
  }
}
const rajaSchema = z.object({
  meta: z.object({ code: z.coerce.number(), message: z.string().optional() }).passthrough(),
  data: z
    .object({
      summary: z
        .object({
          waybill_number: z.string(),
          status: z.string(),
          origin: z.string().nullish(),
          destination: z.string().nullish(),
          service_code: z.string().nullish(),
        })
        .passthrough(),
      manifest: z.array(
        z.object({
          manifest_code: z.string().nullish(),
          manifest_description: z.string(),
          manifest_date: z.string(),
          manifest_time: z.string(),
          city_name: z.string().nullish(),
        }),
      ),
      delivery_status: z
        .object({
          status: z.string().optional(),
          pod_date: z.string().nullish(),
          pod_time: z.string().nullish(),
        })
        .passthrough()
        .optional(),
    })
    .nullable(),
});
export class RajaongkirProvider implements TrackingProvider {
  id = 'rajaongkir';
  name = 'RajaOngkir / Komerce';
  configured: boolean;
  externalTracking = true;
  couriers: CarrierCode[];
  verification =
    'Official AWB endpoint; allowed courier codes must be verified for your account. JNE requires the final 5 phone digits.';
  constructor(private key = process.env.RAJAONGKIR_API_KEY) {
    this.configured = !!key;
    this.couriers = (process.env.RAJAONGKIR_CARRIERS ?? 'jne,sicepat')
      .split(',')
      .filter((c): c is CarrierCode => carriers.some((x) => x.code === c));
  }
  supports(p: Parcel) {
    return p.trackingMode === 'auto' && this.couriers.includes(p.carrierCode);
  }
  async track(p: Parcel, now: Date): Promise<TrackingResult> {
    if (!this.key) throw new ProviderError('AUTH', 'Configure RAJAONGKIR_API_KEY on the server.');
    if (p.carrierCode === 'jne' && !/^\d{5}$/.test(p.phoneVerification))
      throw new ProviderError(
        'VERIFICATION_REQUIRED',
        'RajaOngkir JNE tracking requires the last 5 recipient phone digits.',
      );
    const body = new URLSearchParams({ awb: p.trackingNumber, courier: p.carrierCode });
    if (p.phoneVerification) body.set('last_phone_number', p.phoneVerification);
    const raw = await requestJson('https://rajaongkir.komerce.id/api/v1/track/waybill', {
      method: 'POST',
      headers: { key: this.key, 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const parsed = rajaSchema.safeParse(raw);
    if (!parsed.success)
      throw new ProviderError(
        'INVALID_RESPONSE',
        'RajaOngkir response did not match the documented schema.',
        0,
        true,
      );
    const r = parsed.data;
    if (r.meta.code === 401 || r.meta.code === 403)
      throw new ProviderError('AUTH', 'RajaOngkir rejected credentials.');
    if (r.meta.code === 429) throw new ProviderError('RATE_LIMIT', 'RajaOngkir rate limit reached.', 60000);
    if (r.meta.code !== 200 || !r.data)
      throw new ProviderError(
        r.meta.code === 404 ? 'NOT_FOUND' : 'VERIFICATION_REQUIRED',
        'RajaOngkir could not return tracking data. Verify account access, courier, and phone digits.',
      );
    const d = r.data;
    if (d.summary.waybill_number.toUpperCase() !== p.trackingNumber || !d.manifest.length)
      throw new ProviderError(
        'INVALID_RESPONSE',
        'Tracking response identity or history is invalid.',
        0,
        true,
      );
    const events = d.manifest.map((h) =>
      eventOf(
        this.id,
        dateString(
          `${h.manifest_date}T${h.manifest_time.length === 5 ? h.manifest_time + ':00' : h.manifest_time}+07:00`,
        ),
        h.manifest_description,
        normalizeStatus(this.id, h.manifest_code ?? ''),
        h.city_name ?? null,
        'Asia/Jakarta (UTC+07:00; documented local dates)',
      ),
    );
    return {
      trackingNumber: p.trackingNumber,
      carrierCode: p.carrierCode,
      status: normalizeStatus(this.id, d.summary.status),
      rawStatus: d.summary.status,
      events,
      location: [...events].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]?.location ?? null,
      origin: d.summary.origin ?? null,
      destination: d.summary.destination ?? null,
      service: d.summary.service_code ?? null,
      deliveredAt: [...events].reverse().find((e) => e.type === 'DELIVERED')?.timestamp ?? null,
      providerId: this.id,
      retrievedAt: now.toISOString(),
    };
  }
}
const biteshipSchema = z.object({
  success: z.boolean(),
  waybill_id: z.string(),
  courier: z.object({ company: z.string() }),
  status: z.string(),
  history: z.array(
    z.object({
      note: z.string(),
      updated_at: z.string(),
      status: z.string(),
      service_type: z.string().optional(),
    }),
  ),
});
export class BiteshipProvider implements TrackingProvider {
  id = 'biteship';
  name = 'Biteship';
  configured: boolean;
  externalTracking = false;
  couriers = carriers.map((c) => c.code);
  verification =
    'Restricted to Biteship-created shipments. Requires a Biteship tracking ID; an external AWB alone is insufficient.';
  constructor(private key = process.env.BITESHIP_API_KEY) {
    this.configured = !!key;
  }
  supports(p: Parcel) {
    return p.trackingMode === 'auto' && !!p.providerTrackingId;
  }
  async track(p: Parcel, now: Date): Promise<TrackingResult> {
    if (!this.key) throw new ProviderError('AUTH', 'Configure BITESHIP_API_KEY on the server.');
    if (!p.providerTrackingId)
      throw new ProviderError('MANUAL', 'A Biteship-generated tracking ID is required.');
    const raw = await requestJson(
      `https://api.biteship.com/v1/trackings/${encodeURIComponent(p.providerTrackingId)}`,
      { headers: { Authorization: this.key } },
    );
    const parsed = biteshipSchema.safeParse(raw);
    if (
      !parsed.success ||
      !parsed.data.success ||
      parsed.data.waybill_id.toUpperCase() !== p.trackingNumber ||
      !parsed.data.history.length
    )
      throw new ProviderError(
        'INVALID_RESPONSE',
        'Biteship tracking identity or response is invalid.',
        0,
        true,
      );
    const d = parsed.data;
    const events = d.history.map((h) =>
      eventOf(
        this.id,
        dateString(h.updated_at),
        h.note,
        normalizeStatus(this.id, h.status),
        null,
        'Provider ISO-8601 offset; converted to UTC',
      ),
    );
    return {
      trackingNumber: p.trackingNumber,
      carrierCode: p.carrierCode,
      status: normalizeStatus(this.id, d.status),
      rawStatus: d.status,
      events,
      location: null,
      origin: null,
      destination: null,
      service: d.history.at(-1)?.service_type ?? null,
      deliveredAt: [...events].reverse().find((e) => e.type === 'DELIVERED')?.timestamp ?? null,
      providerId: this.id,
      retrievedAt: now.toISOString(),
    };
  }
}
