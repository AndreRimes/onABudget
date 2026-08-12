import "server-only";

import { Registry, collectDefaultMetrics } from "prom-client";

/**
 * prom-client keeps every instrument in module scope. Next.js re-evaluates
 * modules on HMR in dev, and the standalone server can load a shared chunk more
 * than once across route bundles — so the registry is cached on globalThis, the
 * same way the libSQL client is in ~/server/db.
 *
 * Unlike the DB client this is cached in production too: a duplicated client is
 * merely wasteful, but a duplicated registry means /api/metrics reads the empty
 * one and under-reports silently.
 *
 * Note this is per-process state. Prometheus must scrape every replica
 * separately (distinct `instance` labels); there is exactly one today because
 * SQLite-on-a-local-file forces a single instance.
 */
const globalForMetrics = globalThis as unknown as {
  promRegistry: Registry | undefined;
};

export const registry: Registry =
  globalForMetrics.promRegistry ?? new Registry();

if (!globalForMetrics.promRegistry) {
  registry.setDefaultLabels({ app: "onabudget" });
  // Starts an event-loop-lag interval and a GC PerformanceObserver. The guard
  // is what stops one accumulating per HMR reload.
  collectDefaultMetrics({ register: registry });
  globalForMetrics.promRegistry = registry;
}

/**
 * Idempotent instrument construction. Re-evaluating a module must reuse the
 * already-registered metric — building it twice throws
 * "A metric with the name X has already been registered".
 */
export function defineMetric<T>(name: string, create: () => T): T {
  return (registry.getSingleMetric(name) as T | undefined) ?? create();
}
