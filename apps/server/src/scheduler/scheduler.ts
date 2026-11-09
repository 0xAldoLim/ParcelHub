import { terminalStatuses, nextRefresh } from '../../../../packages/shared/src/index.js';
import { TrackingEngine } from '../tracking/engine.js';
export class Scheduler {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private stopping = false;
  constructor(public engine: TrackingEngine) {}
  recover() {
    const store = this.engine.store;
    for (const p of store.list()) {
      if (!p.nextRefreshAt && !p.archivedAt && !terminalStatuses.includes(p.status) && !p.error) {
        p.nextRefreshAt = nextRefresh(p.status, false, store.settings(), this.engine.now().getTime());
        store.put(p);
      }
    }
  }
  async tick() {
    if (
      this.running ||
      this.stopping ||
      this.engine.store.maintenance ||
      !this.engine.store.settings().autoRefresh
    )
      return;
    this.running = true;
    try {
      const due = this.engine.store
        .list()
        .filter(
          (p) =>
            !p.archivedAt &&
            !terminalStatuses.includes(p.status) &&
            p.nextRefreshAt &&
            Date.parse(p.nextRefreshAt) <= this.engine.now().getTime(),
        )
        .sort((a, b) => (a.nextRefreshAt ?? '').localeCompare(b.nextRefreshAt ?? ''));
      for (const p of due.slice(0, 20)) {
        if (this.stopping || this.engine.store.maintenance) break;
        await this.engine.refresh(p.id).catch(() => undefined);
      }
    } finally {
      this.running = false;
    }
  }
  start() {
    this.recover();
    this.timer = setInterval(() => void this.tick(), 15000);
    this.timer.unref();
    void this.tick();
  }
  async stop() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    while (this.running) await new Promise((r) => setTimeout(r, 10));
    await this.engine.drain();
  }
}
