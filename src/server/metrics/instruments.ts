import "server-only";

import { Counter, Gauge, Histogram } from "prom-client";

import { defineMetric, registry } from "./registry";

/**
 * Every instrument the app records into. Business gauges live in ./business
 * because they need the DB — keeping them out of here is what stops
 * ~/server/db (which imports this file) from forming an import cycle.
 *
 * Label values are deliberately closed sets. Nothing here may ever be labelled
 * with a user id, a ticker symbol or a raw URL/SQL string.
 */

/**
 * Tops out at 30s: importB3 inserts up to 5000 rows one at a time, and a cold
 * getPortfolioSnapshot can serialize behind 12s upstream timeouts.
 */
const WEB_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30,
];

/** The 12/15 buckets exist so the AbortSignal.timeout(12s) cliff is visible. */
const UPSTREAM_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2, 3, 5, 8, 12, 15];

/** Local SQLite — sub-millisecond is the normal case. */
const DB_BUCKETS = [
  0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 1,
];

/* ------------------------------------------------------------------ HTTP -- */

/** `route` is always a hardcoded static pattern, never req.url. */
export const httpRequestDuration = defineMetric(
  "http_request_duration_seconds",
  () =>
    new Histogram({
      name: "http_request_duration_seconds",
      help: "Duration of HTTP requests in seconds, by route handler",
      labelNames: ["method", "route", "status"] as const,
      buckets: WEB_BUCKETS,
      registers: [registry],
    }),
);

export const httpRequestsInFlight = defineMetric(
  "http_requests_in_flight",
  () =>
    new Gauge({
      name: "http_requests_in_flight",
      help: "HTTP requests currently being handled",
      labelNames: ["route"] as const,
      registers: [registry],
    }),
);

/* ------------------------------------------------------------------ tRPC -- */

/**
 * `procedure` is the tRPC path (e.g. "expenses.create") — a fixed set of ~43
 * values across the 7 routers. `code` is intentionally absent here; it lives on
 * the counter so it doesn't multiply the histogram's series.
 */
export const trpcRequestDuration = defineMetric(
  "trpc_request_duration_seconds",
  () =>
    new Histogram({
      name: "trpc_request_duration_seconds",
      help: "tRPC procedure execution duration in seconds",
      labelNames: ["procedure", "type"] as const,
      buckets: WEB_BUCKETS,
      registers: [registry],
    }),
);

/** `code` is "OK" or the TRPCError code (UNAUTHORIZED, BAD_REQUEST, ...). */
export const trpcRequestsTotal = defineMetric(
  "trpc_requests_total",
  () =>
    new Counter({
      name: "trpc_requests_total",
      help: "Total tRPC procedure calls by result code",
      labelNames: ["procedure", "type", "code"] as const,
      registers: [registry],
    }),
);

export const trpcRequestsInFlight = defineMetric(
  "trpc_requests_in_flight",
  () =>
    new Gauge({
      name: "trpc_requests_in_flight",
      help: "tRPC procedures currently executing",
      labelNames: ["type"] as const,
      registers: [registry],
    }),
);

/* -------------------------------------------------- external market data -- */

export type UpstreamProvider = "brapi" | "bcb";
export type UpstreamOperation = "quote" | "candles" | "search" | "cdi";

/**
 * Labelled by provider/operation and never by symbol: a 60-holding portfolio
 * would otherwise create a series per ticker, growing forever as holdings change.
 */
export const upstreamRequestDuration = defineMetric(
  "market_upstream_request_duration_seconds",
  () =>
    new Histogram({
      name: "market_upstream_request_duration_seconds",
      help: "Duration of outbound market-data provider requests in seconds",
      labelNames: ["provider", "operation"] as const,
      buckets: UPSTREAM_BUCKETS,
      registers: [registry],
    }),
);

export const upstreamRequestsTotal = defineMetric(
  "market_upstream_requests_total",
  () =>
    new Counter({
      name: "market_upstream_requests_total",
      help: "Outbound market-data requests by outcome",
      labelNames: ["provider", "operation", "outcome", "status_class"] as const,
      registers: [registry],
    }),
);

export const upstreamRequestsInFlight = defineMetric(
  "market_upstream_requests_in_flight",
  () =>
    new Gauge({
      name: "market_upstream_requests_in_flight",
      help: "Outbound market-data requests currently open",
      labelNames: ["provider"] as const,
      registers: [registry],
    }),
);

/**
 * How many upstream requests one tRPC procedure costs. Only observed when the
 * count is non-zero, so series exist only for procedures that actually call out.
 */
export const upstreamFanoutRequests = defineMetric(
  "market_upstream_fanout_requests",
  () =>
    new Histogram({
      name: "market_upstream_fanout_requests",
      help: "Upstream provider requests issued while serving one tRPC procedure",
      labelNames: ["procedure"] as const,
      buckets: [1, 2, 3, 5, 10, 20, 50, 100],
      registers: [registry],
    }),
);

/* ------------------------------------------------------ market-data cache -- */

/**
 * `result` separates `daily_guard_hit` (the once-a-day candle/CDI sync
 * short-circuit) from a plain cache hit — that guard is what actually keeps the
 * brapi request volume down, so it is worth seeing on its own.
 */
export const marketCacheLookups = defineMetric(
  "market_cache_lookups_total",
  () =>
    new Counter({
      name: "market_cache_lookups_total",
      help: "Market-data cache lookups by outcome",
      labelNames: ["kind", "result"] as const,
      registers: [registry],
    }),
);

/** `status` is the QuoteStatus union: ok | stale | not_found | unavailable. */
export const marketQuoteResults = defineMetric(
  "market_quote_results_total",
  () =>
    new Counter({
      name: "market_quote_results_total",
      help: "Quote results served to callers, by freshness status",
      labelNames: ["status"] as const,
      registers: [registry],
    }),
);

export const marketSyncTotal = defineMetric(
  "market_sync_total",
  () =>
    new Counter({
      name: "market_sync_total",
      help: "Market-data cache sync attempts by outcome",
      labelNames: ["kind", "outcome"] as const,
      registers: [registry],
    }),
);

/* -------------------------------------------------------------- database -- */

/** Labels are derived from the SQL, never the SQL itself. See ~/server/db/instrument. */
export const dbQueryDuration = defineMetric(
  "db_query_duration_seconds",
  () =>
    new Histogram({
      name: "db_query_duration_seconds",
      help: "libSQL statement execution duration in seconds",
      labelNames: ["operation", "table"] as const,
      buckets: DB_BUCKETS,
      registers: [registry],
    }),
);

export const dbQueryErrors = defineMetric(
  "db_query_errors_total",
  () =>
    new Counter({
      name: "db_query_errors_total",
      help: "libSQL statements that threw",
      labelNames: ["operation", "table"] as const,
      registers: [registry],
    }),
);

export const dbQueriesInFlight = defineMetric(
  "db_queries_in_flight",
  () =>
    new Gauge({
      name: "db_queries_in_flight",
      help: "libSQL statements currently executing",
      registers: [registry],
    }),
);

/* ---------------------------------------------------------- domain events -- */

/**
 * Auth is the one surface that never goes through tRPC, so it needs its own
 * counter. Derived from the /api/auth response — no email, user id or IP.
 */
export const authEvents = defineMetric(
  "onabudget_auth_events_total",
  () =>
    new Counter({
      name: "onabudget_auth_events_total",
      help: "Better Auth endpoint calls by action and outcome",
      labelNames: ["action", "outcome"] as const,
      registers: [registry],
    }),
);

/**
 * B3 imports are N rows per request with an inserted/skipped split that
 * trpc_requests_total cannot see. Every other domain mutation is already
 * covered by trpc_requests_total{procedure="...",code="OK"}.
 */
export const b3ImportRows = defineMetric(
  "onabudget_b3_import_rows_total",
  () =>
    new Counter({
      name: "onabudget_b3_import_rows_total",
      help: "Rows processed by B3 spreadsheet imports",
      labelNames: ["kind", "outcome"] as const,
      registers: [registry],
    }),
);
