import { z } from 'zod';

export const statuses = [
  'UNKNOWN',
  'PENDING',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERY_ATTEMPT_FAILED',
  'EXCEPTION',
  'DELIVERED',
  'RETURNING',
  'RETURNED',
  'CANCELLED',
] as const;
export type Status = (typeof statuses)[number];
export const statusLabels: Record<Status, string> = {
  UNKNOWN: 'Not tracked yet',
  PENDING: 'Awaiting pickup',
  PICKED_UP: 'Picked up',
  IN_TRANSIT: 'In transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERY_ATTEMPT_FAILED: 'Delivery attempt failed',
  EXCEPTION: 'Delivery exception',
  DELIVERED: 'Delivered',
  RETURNING: 'Returning',
  RETURNED: 'Returned',
  CANCELLED: 'Cancelled',
};
export const statusLabelsId: Record<Status, string> = {
  UNKNOWN: 'Belum dilacak',
  PENDING: 'Menunggu penjemputan',
  PICKED_UP: 'Sudah dijemput',
  IN_TRANSIT: 'Dalam perjalanan',
  OUT_FOR_DELIVERY: 'Sedang diantar',
  DELIVERY_ATTEMPT_FAILED: 'Pengantaran gagal',
  EXCEPTION: 'Kendala pengiriman',
  DELIVERED: 'Terkirim',
  RETURNING: 'Dalam pengembalian',
  RETURNED: 'Dikembalikan',
  CANCELLED: 'Dibatalkan',
};
export const terminalStatuses: Status[] = ['DELIVERED', 'RETURNED', 'CANCELLED'];
export const attentionStatuses: Status[] = ['EXCEPTION', 'DELIVERY_ATTEMPT_FAILED', 'RETURNING', 'RETURNED'];
export const notifyStatuses: Status[] = [
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELIVERY_ATTEMPT_FAILED',
  'EXCEPTION',
  'RETURNED',
];
export const carriers = [
  {
    code: 'jne',
    name: 'JNE Express',
    short: 'JNE',
    color: '#28489b',
    url: 'https://www.jne.co.id/tracking-package',
  },
  { code: 'jnt', name: 'J&T Express', short: 'J&T', color: '#d83836', url: 'https://www.jet.co.id/track' },
  { code: 'tiki', name: 'TIKI', short: 'TIKI', color: '#2a68b8', url: 'https://www.tiki.id/en/track' },
  { code: 'spx', name: 'Shopee Express', short: 'SPX', color: '#e85e28', url: 'https://spx.co.id/en' },
  { code: 'sicepat', name: 'SiCepat', short: 'SiCepat', color: '#dd334b', url: null },
  {
    code: 'anteraja',
    name: 'AnterAja',
    short: 'Anteraja',
    color: '#e23673',
    url: 'https://anteraja.id/tracking',
  },
  {
    code: 'ninja',
    name: 'Ninja Xpress',
    short: 'Ninja',
    color: '#d72b44',
    url: 'https://www.ninjavan.co/id-id/tracking',
  },
  { code: 'pos', name: 'POS Indonesia', short: 'POS', color: '#e87518', url: null },
  { code: 'lion', name: 'Lion Parcel', short: 'Lion', color: '#d33535', url: null },
  { code: 'idexpress', name: 'ID Express', short: 'iD', color: '#e34440', url: null },
  { code: 'sap', name: 'SAP Express', short: 'SAP', color: '#e6651b', url: null },
  { code: 'lex', name: 'Lazada Logistics', short: 'LEX', color: '#513bc7', url: null },
] as const;
export type CarrierCode = (typeof carriers)[number]['code'];
export const carrierCodes = carriers.map((c) => c.code) as [CarrierCode, ...CarrierCode[]];
export function suggestCarrier(number: string): CarrierCode | undefined {
  if (/^SPX/i.test(number)) return 'spx';
  if (/^JX/i.test(number)) return 'jnt';
  if (/^NVID/i.test(number)) return 'ninja';
  return undefined;
}
export const parcelInput = z.object({
  id: z.uuid().optional(),
  trackingNumber: z
    .string()
    .trim()
    .toUpperCase()
    .min(4)
    .max(64)
    .regex(/^[A-Z0-9-]+$/, 'Use letters, numbers, or hyphens'),
  carrierCode: z.enum(carrierCodes),
  nickname: z.string().trim().max(100).default(''),
  storeName: z.string().trim().max(100).default(''),
  orderDate: z.union([z.iso.date(), z.literal('')]).default(''),
  notes: z.string().max(5000).default(''),
  tags: z.array(z.string().trim().min(1).max(30)).max(12).default([]),
  trackingMode: z.enum(['auto', 'manual', 'mock']).default('auto'),
  phoneVerification: z
    .string()
    .regex(/^\d{4,15}$/)
    .or(z.literal(''))
    .default(''),
  providerTrackingId: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{4,100}$/)
    .or(z.literal(''))
    .default(''),
});
export type ParcelInput = z.infer<typeof parcelInput>;
// PATCH fields must not inherit creation defaults: omitted fields stay untouched.
export const editInput = z.object({
  trackingNumber: parcelInput.shape.trackingNumber.optional(),
  carrierCode: z.enum(carrierCodes).optional(),
  nickname: z.string().trim().max(100).optional(),
  storeName: z.string().trim().max(100).optional(),
  orderDate: z.union([z.iso.date(), z.literal('')]).optional(),
  notes: z.string().max(5000).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(12).optional(),
  trackingMode: z.enum(['auto', 'manual', 'mock']).optional(),
  phoneVerification: z
    .string()
    .regex(/^\d{4,15}$/)
    .or(z.literal(''))
    .optional(),
  providerTrackingId: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{4,100}$/)
    .or(z.literal(''))
    .optional(),
  archivedAt: z.iso.datetime().nullable().optional(),
  expectedVersion: z.number().int().positive(),
});
export type ParcelEdit = z.infer<typeof editInput>;
export interface TrackingEvent {
  id: string;
  timestamp: string;
  timezone: string;
  location: string | null;
  description: string;
  originalDescription: string;
  type: Status;
  providerId: string;
}
export interface TrackingResult {
  trackingNumber: string;
  carrierCode: CarrierCode;
  status: Status;
  rawStatus: string;
  events: TrackingEvent[];
  location: string | null;
  origin: string | null;
  destination: string | null;
  service: string | null;
  deliveredAt: string | null;
  providerId: string;
  retrievedAt: string;
  metadata?: Record<string, unknown>;
}
export interface Parcel extends ParcelInput {
  id: string;
  status: Status;
  rawStatus: string;
  location: string | null;
  origin: string | null;
  destination: string | null;
  service: string | null;
  deliveredAt: string | null;
  providerId: string | null;
  lastSuccessfulRefresh: string | null;
  lastRefreshAttempt: string | null;
  lastStatusChange: string | null;
  error: string | null;
  errorCategory: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  nextRefreshAt: string | null;
  failures: number;
  events: TrackingEvent[];
}
export const providerIds = ['klikresi', 'rajaongkir', 'biteship', 'mock', 'manual'] as const;
export type ProviderId = (typeof providerIds)[number];
export const providerConfigSchema = z.object({
  id: z.enum(providerIds),
  enabled: z.boolean(),
  priority: z.number().int().min(0).max(100),
  costPerRequest: z.number().min(0).max(1000000),
  dailyCap: z.number().int().min(0).max(1000000),
  monthlyCap: z.number().int().min(0).max(10000000),
});
export type ProviderConfig = z.infer<typeof providerConfigSchema>;
export const settingsSchema = z
  .object({
    autoRefresh: z.boolean(),
    refreshMinutes: z.number().int().min(5).max(10080),
    manualCooldownSeconds: z.number().int().min(10).max(3600),
    dailyCap: z.number().int().min(0).max(1000000),
    monthlyCap: z.number().int().min(0).max(10000000),
    monthlyBudget: z.number().min(0).max(100000000),
    allowPaid: z.boolean(),
    allowFallback: z.boolean(),
    theme: z.enum(['light', 'dark', 'system']),
    language: z.enum(['en', 'id']),
    notifications: z.boolean(),
    subscriptions: z.array(z.enum(statuses)),
    providers: z.array(providerConfigSchema).length(5),
  })
  .refine((s) => new Set(s.providers.map((p) => p.id)).size === 5, 'Each provider must appear exactly once');
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = {
  autoRefresh: true,
  refreshMinutes: 240,
  manualCooldownSeconds: 60,
  dailyCap: 100,
  monthlyCap: 1000,
  monthlyBudget: 50000,
  allowPaid: false,
  allowFallback: false,
  theme: 'light',
  language: 'en',
  notifications: false,
  subscriptions: notifyStatuses,
  providers: [
    { id: 'klikresi', enabled: true, priority: 1, costPerRequest: 15, dailyCap: 100, monthlyCap: 1000 },
    { id: 'rajaongkir', enabled: false, priority: 2, costPerRequest: 15, dailyCap: 100, monthlyCap: 1000 },
    { id: 'biteship', enabled: false, priority: 3, costPerRequest: 100, dailyCap: 100, monthlyCap: 1000 },
    { id: 'mock', enabled: true, priority: 99, costPerRequest: 0, dailyCap: 1000, monthlyCap: 10000 },
    { id: 'manual', enabled: true, priority: 100, costPerRequest: 0, dailyCap: 0, monthlyCap: 0 },
  ],
};
export interface ProviderInfo extends ProviderConfig {
  name: string;
  configured: boolean;
  couriers: CarrierCode[];
  externalTracking: boolean;
  verification: string;
  disabledReason: string | null;
  failures: number;
  openUntil: string | null;
}
export interface Notice {
  id: string;
  parcelId: string;
  title: string;
  status: Status;
  synthetic: boolean;
  createdAt: string;
}
export interface Usage {
  today: number;
  month: number;
  success: number;
  failed: number;
  estimatedCost: number;
  byProvider: { id: string; requests: number; success: number; failed: number; estimatedCost: number }[];
  dailyRemaining: number;
  monthlyRemaining: number;
  budgetRemaining: number;
}
export const eventSchema = z.object({
  id: z.string().max(100),
  timestamp: z.iso.datetime(),
  timezone: z.string().max(200),
  location: z.string().max(1000).nullable(),
  description: z.string().max(10000),
  originalDescription: z.string().max(10000),
  type: z.enum(statuses),
  providerId: z.enum(providerIds),
});
export const fullParcelSchema = parcelInput.extend({
  id: z.uuid(),
  status: z.enum(statuses),
  rawStatus: z.string().max(1000),
  location: z.string().max(1000).nullable(),
  origin: z.string().max(2000).nullable(),
  destination: z.string().max(2000).nullable(),
  service: z.string().max(1000).nullable(),
  deliveredAt: z.iso.datetime().nullable().default(null),
  providerId: z.enum(providerIds).nullable(),
  lastSuccessfulRefresh: z.iso.datetime().nullable(),
  lastRefreshAttempt: z.iso.datetime().nullable(),
  lastStatusChange: z.iso.datetime().nullable(),
  error: z.string().max(2000).nullable(),
  errorCategory: z.string().max(100).nullable(),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  version: z.number().int().positive(),
  nextRefreshAt: z.iso.datetime().nullable(),
  failures: z.number().int().min(0),
  events: z.array(eventSchema).max(10000),
});
export const exportSchema = z.object({
  format: z.literal('parcelhub-v1'),
  parcels: z.array(fullParcelSchema).max(10000),
  settings: settingsSchema.optional(),
});

// Exact, provider-specific mappings. Unknown descriptions remain UNKNOWN.
const maps: Record<string, Record<string, Status>> = {
  klikresi: {
    InfoReceived: 'PENDING',
    Pending: 'PENDING',
    InTransit: 'IN_TRANSIT',
    OutForDelivery: 'OUT_FOR_DELIVERY',
    FailedAttempt: 'DELIVERY_ATTEMPT_FAILED',
    Delivered: 'DELIVERED',
    ReturnToSender: 'RETURNING',
    Exception: 'EXCEPTION',
    Expired: 'EXCEPTION',
  },
  biteship: {
    confirmed: 'PENDING',
    scheduled: 'PENDING',
    allocated: 'PENDING',
    picking_up: 'PENDING',
    picked: 'PICKED_UP',
    in_transit: 'IN_TRANSIT',
    dropping_off: 'OUT_FOR_DELIVERY',
    delivered: 'DELIVERED',
    return_in_transit: 'RETURNING',
    returned: 'RETURNED',
    cancelled: 'CANCELLED',
    rejected: 'EXCEPTION',
    on_hold: 'EXCEPTION',
    courier_not_found: 'EXCEPTION',
  },
  rajaongkir: {
    DELIVERED: 'DELIVERED',
    'ON PROCESS': 'IN_TRANSIT',
    'IN TRANSIT': 'IN_TRANSIT',
    MANIFESTED: 'PENDING',
    'PICKED UP': 'PICKED_UP',
    'OUT FOR DELIVERY': 'OUT_FOR_DELIVERY',
    RETURNED: 'RETURNED',
    RETURN: 'RETURNING',
    CANCELLED: 'CANCELLED',
  },
};
export function normalizeStatus(provider: string, raw: string): Status {
  return maps[provider]?.[raw] ?? 'UNKNOWN';
}
export function fingerprint(...values: (string | null)[]): string {
  let h = 2166136261;
  for (const char of values.map((v) => v ?? '').join('\u001f')) {
    h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
export function eventOf(
  providerId: string,
  timestamp: string,
  description: string,
  type: Status,
  location: string | null = null,
  timezone = 'UTC',
): TrackingEvent {
  return {
    id: fingerprint(providerId, timestamp, description, location),
    timestamp,
    timezone,
    location,
    description,
    originalDescription: description,
    type,
    providerId,
  };
}
export function transitionId(parcelId: string, from: Status, to: Status, eventId: string): string | null {
  return from === to || !notifyStatuses.includes(to) ? null : fingerprint(parcelId, from, to, eventId);
}
export function backoffMs(failures: number, retryAfterMs = 0): number {
  return Math.max(retryAfterMs, Math.min(24 * 3600000, 60000 * 2 ** Math.min(Math.max(0, failures - 1), 11)));
}
export function nextRefresh(
  status: Status,
  archived: boolean,
  settings: Settings,
  now: number,
  failures = 0,
  retryAfterMs = 0,
): string | null {
  if (!settings.autoRefresh || archived || terminalStatuses.includes(status)) return null;
  const interval =
    status === 'OUT_FOR_DELIVERY' ? Math.min(settings.refreshMinutes, 60) : settings.refreshMinutes;
  return new Date(now + (failures ? backoffMs(failures, retryAfterMs) : interval * 60000)).toISOString();
}
export function duplicateKey(p: Pick<ParcelInput, 'carrierCode' | 'trackingNumber'>): string {
  return `${p.carrierCode}:${p.trackingNumber.trim().toUpperCase()}`;
}
