import type { CarrierCode, Parcel, TrackingResult } from '../../../../packages/shared/src/index.js';
export type ErrorCategory =
  | 'AUTH'
  | 'RATE_LIMIT'
  | 'NOT_FOUND'
  | 'VERIFICATION_REQUIRED'
  | 'NETWORK'
  | 'UPSTREAM'
  | 'INVALID_RESPONSE'
  | 'BUDGET'
  | 'MANUAL'
  | 'COOLDOWN'
  | 'CIRCUIT_OPEN';
export class ProviderError extends Error {
  constructor(
    public category: ErrorCategory,
    message: string,
    public retryAfterMs = 0,
    public billable = false,
  ) {
    super(message);
  }
}
export interface TrackingProvider {
  id: string;
  name: string;
  configured: boolean;
  couriers: CarrierCode[];
  externalTracking: boolean;
  verification: string;
  supports(p: Parcel): boolean;
  track(p: Parcel, now: Date): Promise<TrackingResult>;
  testConnection?(): Promise<void>;
}
export async function requestJson(url: string, init: RequestInit = {}): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(20000) });
  } catch {
    throw new ProviderError('NETWORK', 'Provider could not be reached. Cached tracking is preserved.');
  }
  if (response.status === 401 || response.status === 403)
    throw new ProviderError(
      'AUTH',
      'Provider rejected credentials. Update the server environment, restart, then reset the provider.',
    );
  if (response.status === 429) {
    const retry = response.headers.get('retry-after');
    const delay = retry
      ? /^\d+$/.test(retry)
        ? Number(retry) * 1000
        : Math.max(0, Date.parse(retry) - Date.now())
      : 60000;
    throw new ProviderError(
      'RATE_LIMIT',
      'Provider rate limit reached.',
      Number.isFinite(delay) ? delay : 60000,
    );
  }
  if (response.status === 404)
    throw new ProviderError('NOT_FOUND', 'No tracking data was found for this number.');
  if (!response.ok) throw new ProviderError('UPSTREAM', 'Provider returned an error.');
  try {
    return await response.json();
  } catch {
    throw new ProviderError('INVALID_RESPONSE', 'Provider response was not valid JSON.', 0, true);
  }
}
