import {
  nextRefresh,
  transitionId,
  type Parcel,
  type ProviderInfo,
  type Settings,
  type Usage,
  type TrackingResult,
} from '../../../../packages/shared/src/index.js';
import { Store } from '../persistence/database.js';
import { ProviderError, type TrackingProvider } from '../providers/types.js';
import { MockProvider } from '../providers/mock.js';
import { KlikresiProvider, RajaongkirProvider, BiteshipProvider } from '../providers/real.js';

export class TrackingEngine {
  private inflight = new Map<string, Promise<Parcel>>();
  private providerChains = new Map<string, Promise<void>>();
  providers: TrackingProvider[];
  constructor(
    public store: Store,
    providers?: TrackingProvider[],
    public now = () => new Date(),
  ) {
    this.providers = providers ?? [
      new KlikresiProvider(),
      new RajaongkirProvider(),
      new BiteshipProvider(),
      new MockProvider(),
    ];
  }
  info(): ProviderInfo[] {
    return this.store.settings().providers.map((config) => {
      const provider = this.providers.find((p) => p.id === config.id);
      const state = this.store.state(config.id);
      return {
        ...config,
        name: provider?.name ?? 'Manual tracking',
        configured: provider?.configured ?? true,
        couriers: provider?.couriers ?? [],
        externalTracking: provider?.externalTracking ?? false,
        verification: provider?.verification ?? 'Open a verified official page; no automated retrieval.',
        disabledReason: state.disabled_reason,
        failures: state.failures,
        openUntil: state.open_until,
      };
    });
  }
  usage(): Usage {
    const stamp = this.now().toISOString();
    const month = stamp.slice(0, 7);
    const today = stamp.slice(0, 10);
    const rows = this.store.db
      .prepare('SELECT provider_id,request_time,success,estimated_cost FROM api_usage WHERE request_time>=?')
      .all(`${month}-01T00:00:00.000Z`);
    const byProvider = this.store
      .settings()
      .providers.filter((p) => p.id !== 'manual')
      .map((p) => {
        const r = rows.filter((x) => x.provider_id === p.id);
        return {
          id: p.id,
          requests: r.length,
          success: r.filter((x) => x.success === 1).length,
          failed: r.filter((x) => x.success === 0).length,
          estimatedCost: r.reduce((s, x) => s + Number(x.estimated_cost), 0),
        };
      });
    const settings = this.store.settings(),
      estimatedCost = byProvider.reduce((s, p) => s + p.estimatedCost, 0);
    const count = rows.filter((x) => String(x.request_time).startsWith(today)).length;
    return {
      today: count,
      month: rows.length,
      success: rows.filter((x) => x.success === 1).length,
      failed: rows.filter((x) => x.success === 0).length,
      estimatedCost,
      byProvider,
      dailyRemaining: Math.max(0, settings.dailyCap - count),
      monthlyRemaining: Math.max(0, settings.monthlyCap - rows.length),
      budgetRemaining: Math.max(0, settings.monthlyBudget - estimatedCost),
    };
  }
  private reserve(provider: TrackingProvider, p: Parcel, settings: Settings): string {
    const cfg = settings.providers.find((x) => x.id === provider.id)!;
    const state = this.store.state(provider.id);
    const now = this.now();
    if (state.disabled_reason)
      throw new ProviderError(
        'AUTH',
        'Provider is paused after authentication failure. Update credentials and reset the provider.',
      );
    if (state.open_until && Date.parse(state.open_until) > now.getTime())
      throw new ProviderError(
        'CIRCUIT_OPEN',
        'Provider is cooling down after a failure.',
        Date.parse(state.open_until) - now.getTime(),
      );
    return this.store.transaction(() => {
      const usage = this.usage();
      const today = now.toISOString().slice(0, 10),
        month = now.toISOString().slice(0, 7);
      const counts = this.store.db
        .prepare('SELECT request_time FROM api_usage WHERE provider_id=? AND request_time>=?')
        .all(provider.id, `${month}-01T00:00:00.000Z`);
      if (provider.id !== 'mock' && !settings.allowPaid)
        throw new ProviderError('BUDGET', 'Real API calls are disabled in Settings.');
      const nextDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();
      const nextMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - now.getTime();
      if (
        usage.monthlyRemaining === 0 ||
        counts.length >= cfg.monthlyCap ||
        usage.estimatedCost + cfg.costPerRequest > settings.monthlyBudget
      )
        throw new ProviderError(
          'BUDGET',
          'Monthly request or estimated spend budget is exhausted.',
          nextMonth,
        );
      if (
        usage.dailyRemaining === 0 ||
        counts.filter((x) => String(x.request_time).startsWith(today)).length >= cfg.dailyCap
      )
        throw new ProviderError('BUDGET', 'Daily request budget is exhausted.', nextDay);
      return this.store.reserve(provider.id, p.id, cfg.costPerRequest, now.toISOString());
    });
  }
  private async serialized<T>(providerId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.providerChains.get(providerId) ?? Promise.resolve();
    let release!: () => void;
    const lock = new Promise<void>((r) => {
      release = r;
    });
    const tail = previous.then(() => lock);
    this.providerChains.set(providerId, tail);
    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this.providerChains.get(providerId) === tail) this.providerChains.delete(providerId);
    }
  }
  refresh(id: string, manual = false): Promise<Parcel> {
    const running = this.inflight.get(id);
    if (running) return running;
    const job = this.perform(id, manual).finally(() => this.inflight.delete(id));
    this.inflight.set(id, job);
    return job;
  }
  private async perform(id: string, manual: boolean): Promise<Parcel> {
    const initial = this.store.get(id);
    if (!initial) throw new Error('Parcel not found');
    const settings = this.store.settings();
    if (
      manual &&
      initial.lastRefreshAttempt &&
      this.now().getTime() - Date.parse(initial.lastRefreshAttempt) < settings.manualCooldownSeconds * 1000
    )
      throw new ProviderError(
        'COOLDOWN',
        `Wait ${settings.manualCooldownSeconds} seconds between refresh attempts.`,
      );
    if (initial.archivedAt) return initial;
    const candidates = this.providers
      .filter(
        (p) =>
          p.configured && p.supports(initial) && settings.providers.some((c) => c.id === p.id && c.enabled),
      )
      .sort(
        (a, b) =>
          settings.providers.find((c) => c.id === a.id)!.priority -
          settings.providers.find((c) => c.id === b.id)!.priority,
      );
    let failure = new ProviderError(
      'MANUAL',
      initial.trackingMode === 'manual'
        ? 'Manual tracking selected. Open the official courier tracking page.'
        : 'No eligible API is configured. Save your parcel and use manual tracking, or configure a provider.',
    );
    const attempts = settings.allowFallback ? candidates : candidates.slice(0, 1);
    for (const provider of attempts) {
      try {
        const result = await this.serialized(provider.id, async () => {
          const current = this.store.get(id);
          if (!current) throw new ProviderError('MANUAL', 'Parcel was deleted.');
          const requestId = this.reserve(provider, current, settings);
          const cfg = settings.providers.find((c) => c.id === provider.id)!;
          try {
            const result = await provider.track(current, this.now());
            if (
              !result.events.length ||
              result.trackingNumber !== current.trackingNumber ||
              result.carrierCode !== current.carrierCode
            )
              throw new ProviderError(
                'INVALID_RESPONSE',
                'Provider response identity or history is invalid.',
                0,
                true,
              );
            this.store.finishUsage(requestId, true, cfg.costPerRequest, null);
            this.store.setState(provider.id, null, 0, null);
            return result;
          } catch (e) {
            const error =
              e instanceof ProviderError
                ? e
                : new ProviderError('UPSTREAM', 'Tracking provider failed. Cached data is preserved.');
            this.store.finishUsage(
              requestId,
              false,
              provider.id === 'klikresi' && !error.billable ? 0 : cfg.costPerRequest,
              error.category,
            );
            const state = this.store.state(provider.id);
            const count = state.failures + 1;
            this.store.setState(
              provider.id,
              error.category === 'AUTH' ? error.message : null,
              count,
              error.category === 'RATE_LIMIT' || count >= 3
                ? new Date(
                    this.now().getTime() + Math.max(error.retryAfterMs, 60000 * Math.min(count, 60)),
                  ).toISOString()
                : null,
            );
            throw error;
          }
        });
        return this.apply(id, result);
      } catch (e) {
        failure = e instanceof ProviderError ? e : new ProviderError('UPSTREAM', 'Tracking provider failed.');
      }
    }
    const current = this.store.get(id);
    if (!current) return initial;
    current.lastRefreshAttempt = this.now().toISOString();
    current.error = failure.message;
    current.errorCategory = failure.category;
    current.failures++;
    current.updatedAt = this.now().toISOString();
    current.version++;
    current.nextRefreshAt =
      ['MANUAL', 'AUTH', 'VERIFICATION_REQUIRED'].includes(failure.category) ||
      (failure.category === 'BUDGET' && !failure.retryAfterMs)
        ? null
        : nextRefresh(
            current.status,
            !!current.archivedAt,
            settings,
            this.now().getTime(),
            current.failures,
            failure.retryAfterMs,
          );
    this.store.put(current);
    return current;
  }
  apply(id: string, result: TrackingResult): Parcel {
    return this.store.transaction(() => {
      const p = this.store.get(id);
      if (!p) throw new Error('Parcel was deleted during refresh');
      if (
        p.trackingMode === 'manual' ||
        (result.providerId === 'mock' && p.trackingMode !== 'mock') ||
        (result.providerId !== 'mock' && p.trackingMode === 'mock')
      )
        return p;
      const latest = [...result.events].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
      const transition = transitionId(p.id, p.status, result.status, latest.id);
      if (transition && this.store.settings().subscriptions.includes(result.status))
        this.store.addNotice({
          id: transition,
          parcelId: p.id,
          title: p.nickname || p.trackingNumber,
          status: result.status,
          synthetic: result.providerId === 'mock',
          createdAt: this.now().toISOString(),
        });
      if (p.status !== result.status) p.lastStatusChange = this.now().toISOString();
      Object.assign(p, {
        status: result.status,
        rawStatus: result.rawStatus,
        location: result.location,
        origin: result.origin,
        destination: result.destination,
        service: result.service,
        deliveredAt: result.deliveredAt,
        providerId: result.providerId,
        lastSuccessfulRefresh: result.retrievedAt,
        lastRefreshAttempt: this.now().toISOString(),
        updatedAt: this.now().toISOString(),
        error: null,
        errorCategory: null,
        failures: 0,
        events: result.events,
        version: p.version + 1,
      });
      p.nextRefreshAt = nextRefresh(p.status, !!p.archivedAt, this.store.settings(), this.now().getTime());
      this.store.put(p);
      return this.store.get(id)!;
    });
  }
  async drain() {
    await Promise.allSettled([...this.inflight.values()]);
  }
}
