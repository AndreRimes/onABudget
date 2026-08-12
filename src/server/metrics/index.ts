export { defineMetric, registry } from "./registry";
export * from "./instruments";
export { withHttpMetrics } from "./http";
export { countUpstreamCall, withUpstreamFanoutScope } from "./upstream";
export { recordAuthEvent } from "./auth";

// ./business is deliberately NOT re-exported here: it imports ~/server/db,
// which imports ./instruments. Consumers that want the scrape-time gauges
// (the /api/metrics route, src/instrumentation.ts) import it directly.
