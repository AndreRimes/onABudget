import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import { upstreamFanoutRequests } from "./instruments";

/**
 * Request-scoped counter for outbound market-data calls, so we can answer
 * "how many brapi requests does one portfolio snapshot cost?".
 *
 * getPortfolioSnapshot fans out through Promise.all and mapWithConcurrency, so
 * diffing a global counter around the procedure would race with concurrent
 * requests. AsyncLocalStorage propagates correctly through both.
 *
 * Cached on globalThis for the same reason as the registry: an HMR-duplicated
 * store would leave brapi.ts writing to state the tRPC middleware cannot read.
 */
const globalForUpstream = globalThis as unknown as {
  upstreamFanoutStore: AsyncLocalStorage<{ count: number }> | undefined;
};

const store =
  globalForUpstream.upstreamFanoutStore ??
  new AsyncLocalStorage<{ count: number }>();
globalForUpstream.upstreamFanoutStore = store;

export function withUpstreamFanoutScope<T>(
  procedure: string,
  fn: () => Promise<T>,
): Promise<T> {
  const state = { count: 0 };

  return store.run(state, async () => {
    try {
      return await fn();
    } finally {
      // Only observed when the procedure actually called out, so this metric
      // has series only for the handful of procedures that touch a provider.
      // It therefore samples cold-cache calls: a fully cached snapshot records
      // nothing. That is the intent — this answers "how expensive is a cold
      // snapshot", while cache effectiveness lives in market_cache_lookups_total.
      if (state.count > 0) {
        upstreamFanoutRequests.observe({ procedure }, state.count);
      }
    }
  });
}

/** Called once per outbound provider request. No-op outside a scope. */
export function countUpstreamCall(): void {
  const state = store.getStore();
  if (state) state.count += 1;
}
