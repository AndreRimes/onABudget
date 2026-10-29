import { AsyncLocalStorage } from "node:async_hooks";
import { Histogram } from "prom-client";
import { defineMetric, registry } from "./registry";

type Source = "rsc" | "http" | "middleware";
type Stage =
  | "session"
  | "ledger"
  | "market_cache"
  | "calculation"
  | "market_refresh";
const globalForPerformance = globalThis as unknown as {
  performanceSource?: AsyncLocalStorage<Source>;
};
const source = (globalForPerformance.performanceSource ??=
  new AsyncLocalStorage<Source>());

export const performanceDuration = defineMetric(
  "app_stage_duration_seconds",
  () =>
    new Histogram({
      name: "app_stage_duration_seconds",
      help: "Application stage duration, excluding browser and proxy latency",
      labelNames: ["stage", "source"] as const,
      buckets: [
        0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1, 2.5, 5, 20, 60,
      ],
      registers: [registry],
    }),
);

export function withPerformanceSource<T>(value: Source, work: () => T): T {
  return source.run(value, work);
}

export async function measureStage<T>(
  stage: Stage,
  work: () => PromiseLike<T>,
): Promise<T> {
  const stop = performanceDuration.startTimer({
    stage,
    source: source.getStore() ?? "http",
  });
  try {
    return await work();
  } finally {
    stop();
  }
}

export function measureCalculation<T>(work: () => T): T {
  const stop = performanceDuration.startTimer({
    stage: "calculation",
    source: source.getStore() ?? "http",
  });
  try {
    return work();
  } finally {
    stop();
  }
}
