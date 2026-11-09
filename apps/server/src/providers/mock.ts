import {
  eventOf,
  type Parcel,
  type Status,
  type TrackingResult,
  carriers,
} from '../../../../packages/shared/src/index.js';
import type { TrackingProvider } from './types.js';
export class MockProvider implements TrackingProvider {
  private stepMs = Math.max(1000, Number(process.env.MOCK_STEP_MS) || 60000);
  id = 'mock';
  name = 'Mock · synthetic';
  configured = true;
  couriers = carriers.map((c) => c.code);
  externalTracking = false;
  verification = 'Deterministic synthetic events. Never live courier data.';
  supports(p: Parcel) {
    return p.trackingMode === 'mock';
  }
  async track(p: Parcel, now: Date): Promise<TrackingResult> {
    const states: Status[] = ['PENDING', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'];
    const stage = Math.min(
      4,
      Math.max(0, Math.floor((now.getTime() - Date.parse(p.createdAt)) / this.stepMs)),
    );
    const descriptions = [
      'Informasi pengiriman diterima',
      'Paket telah dijemput dari pengirim',
      'Paket tiba di pusat sortir Jakarta',
      'Paket sedang dibawa kurir ke alamat penerima',
      'Paket telah diterima oleh penerima',
    ];
    const events = states
      .slice(0, stage + 1)
      .map((status, i) =>
        eventOf(
          'mock',
          new Date(Date.parse(p.createdAt) + i * this.stepMs).toISOString(),
          `[SYNTHETIC] ${descriptions[i]}`,
          status,
          i < 2 ? 'Bandung' : 'Jakarta',
          'UTC',
        ),
      );
    return {
      trackingNumber: p.trackingNumber,
      carrierCode: p.carrierCode,
      status: states[stage],
      rawStatus: `SYNTHETIC_${states[stage]}`,
      events,
      location: stage < 2 ? 'Bandung' : 'Jakarta',
      origin: 'Bandung',
      destination: 'Jakarta',
      service: 'Synthetic regular',
      deliveredAt: stage === 4 ? events.at(-1)!.timestamp : null,
      providerId: 'mock',
      retrievedAt: now.toISOString(),
    };
  }
}
