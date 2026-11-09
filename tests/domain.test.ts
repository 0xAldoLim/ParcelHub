import { describe, it, expect } from 'vitest';
import { editInput } from '../packages/shared/src/index';
import {
  defaultSettings,
  normalizeStatus,
  eventOf,
  fingerprint,
  duplicateKey,
  nextRefresh,
  backoffMs,
  transitionId,
  parcelInput,
  settingsSchema,
} from '../packages/shared/src/index';
describe('tracking domain', () => {
  it('does not apply creation defaults to partial edits', () => {
    expect(editInput.parse({ archivedAt: null, expectedVersion: 1 })).toEqual({
      archivedAt: null,
      expectedVersion: 1,
    });
    expect(editInput.parse({ notes: 'Only this field', expectedVersion: 2 })).toEqual({
      notes: 'Only this field',
      expectedVersion: 2,
    });
  });
  it('uses exact provider mappings and keeps ambiguous statuses unknown', () => {
    expect(normalizeStatus('klikresi', 'Delivered')).toBe('DELIVERED');
    expect(normalizeStatus('rajaongkir', 'ON PROCESS')).toBe('IN_TRANSIT');
    expect(normalizeStatus('biteship', 'dropping_off')).toBe('OUT_FOR_DELIVERY');
    for (const raw of ['not delivered', 'possibly delivered', 'Received at destination', 'Completed?'])
      expect(normalizeStatus('rajaongkir', raw)).toBe('UNKNOWN');
  });
  it('preserves the full original courier description and stable fingerprints', () => {
    const e = eventOf(
      'klikresi',
      '2026-01-01T00:00:00.000Z',
      'Paket diterima di gudang [JAKARTA]',
      'IN_TRANSIT',
      'Jakarta',
    );
    expect(e.originalDescription).toBe('Paket diterima di gudang [JAKARTA]');
    expect(eventOf('klikresi', e.timestamp, e.description, e.type, e.location).id).toBe(e.id);
    expect(fingerprint('a', 'bc')).not.toBe(fingerprint('ab', 'c'));
  });
  it('detects duplicates per courier and normalizes tracking case', () => {
    expect(duplicateKey({ carrierCode: 'jne', trackingNumber: ' abc123 ' })).toBe('jne:ABC123');
    expect(duplicateKey({ carrierCode: 'jne', trackingNumber: 'ABC123' })).not.toBe(
      duplicateKey({ carrierCode: 'jnt', trackingNumber: 'ABC123' }),
    );
  });
  it('stops delivered, returned, cancelled, archived and disabled polling', () => {
    for (const s of ['DELIVERED', 'RETURNED', 'CANCELLED'] as const)
      expect(nextRefresh(s, false, defaultSettings, 0)).toBeNull();
    expect(nextRefresh('IN_TRANSIT', true, defaultSettings, 0)).toBeNull();
    expect(nextRefresh('IN_TRANSIT', false, { ...defaultSettings, autoRefresh: false }, 0)).toBeNull();
    expect(nextRefresh('IN_TRANSIT', false, defaultSettings, 0)).toBe('1970-01-01T04:00:00.000Z');
    expect(nextRefresh('OUT_FOR_DELIVERY', false, defaultSettings, 0)).toBe('1970-01-01T01:00:00.000Z');
  });
  it('bounds exponential backoff and respects longer retry-after requirements', () => {
    expect(backoffMs(1)).toBe(60000);
    expect(backoffMs(3)).toBe(240000);
    expect(backoffMs(100)).toBeLessThanOrEqual(86400000);
    expect(backoffMs(1, 200000)).toBe(200000);
  });
  it('only generates notification transitions for meaningful changes', () => {
    expect(transitionId('p', 'IN_TRANSIT', 'IN_TRANSIT', 'e')).toBeNull();
    expect(transitionId('p', 'UNKNOWN', 'PENDING', 'e')).toBeNull();
    expect(transitionId('p', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'e')).toBeTruthy();
    expect(transitionId('p', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'e')).toBe(
      transitionId('p', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'e'),
    );
  });
  it('rejects malicious/oversized input and invalid provider budgets', () => {
    expect(
      parcelInput.safeParse({ trackingNumber: "x'; DROP TABLE parcels;", carrierCode: 'jne' }).success,
    ).toBe(false);
    expect(parcelInput.safeParse({ trackingNumber: 'A'.repeat(65), carrierCode: 'jne' }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...defaultSettings, monthlyBudget: -1 }).success).toBe(false);
    expect(
      settingsSchema.safeParse({
        ...defaultSettings,
        providers: defaultSettings.providers.map(() => defaultSettings.providers[0]),
      }).success,
    ).toBe(false);
  });
});
