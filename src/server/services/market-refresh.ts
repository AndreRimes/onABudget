// One application instance owns the local SQLite cache. Reads never join this queue.
export class MarketRefreshQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private readonly pending = new Map<string, Promise<unknown>>();

  run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) return existing as Promise<T>;
    const task = this.tail.then(work).finally(() => this.pending.delete(key));
    this.pending.set(key, task);
    this.tail = task.catch(() => undefined);
    return task;
  }
}

// Serialize refreshes so overlapping portfolios reuse the persisted resource cache.
// shortcut: process-local coordination; use a shared queue before adding replicas.
const globalForRefresh = globalThis as unknown as {
  marketRefreshQueue?: MarketRefreshQueue;
};
export const marketRefreshQueue = (globalForRefresh.marketRefreshQueue ??=
  new MarketRefreshQueue());
