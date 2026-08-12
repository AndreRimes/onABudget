import "server-only";

import { count, gt } from "drizzle-orm";
import { Counter, Gauge } from "prom-client";

import { db } from "~/server/db";
import {
  accounts,
  budget,
  cdiRates,
  dividends,
  expenses,
  investmentTransactions,
  marketCandles,
  marketSymbols,
  session,
  user,
} from "~/server/db/schema";

import { defineMetric, registry } from "./registry";

/**
 * Usage gauges, sampled at scrape time.
 *
 * The app has no background jobs, so there is nowhere to run a periodic
 * refresh — but prom-client awaits async `collect()` hooks, which lets the
 * scrape itself drive the queries. All of these are cheap COUNT(*)s on a local
 * SQLite file.
 *
 * This module imports ~/server/db, which imports ./instruments. It must
 * therefore never be imported from ./index (that would close the cycle) — only
 * the /api/metrics route and src/instrumentation.ts pull it in directly.
 */

/** Prometheus scrapes every 30s; this only caps damage from extra scrapers. */
const MIN_REFRESH_MS = 15_000;

/** A locked DB (e.g. a migration at container start) must not stall a scrape. */
const COLLECT_TIMEOUT_MS = 2_000;

const gauge = (name: string, help: string, labelNames: string[] = []) =>
  defineMetric(
    name,
    () => new Gauge({ name, help, labelNames, registers: [registry] }),
  );

// prom-client invokes collect() per metric, so the hook is attached to exactly
// one gauge; the memo inside refreshBusinessGauges makes that single call
// refresh all of them.
export const usersGauge = defineMetric(
  "onabudget_users",
  () =>
    new Gauge({
      name: "onabudget_users",
      help: "Registered users",
      registers: [registry],
      async collect() {
        await refreshBusinessGauges();
      },
    }),
);
export const activeSessionsGauge = gauge(
  "onabudget_active_sessions",
  "Sessions that have not expired yet",
);
export const accountsGauge = gauge(
  "onabudget_accounts",
  "Financial accounts by type",
  ["account_type"],
);
export const expensesGauge = gauge("onabudget_expenses", "Recorded expenses");
export const investmentTransactionsGauge = gauge(
  "onabudget_investment_transactions",
  "Recorded investment transactions",
);
export const dividendsGauge = gauge(
  "onabudget_dividends",
  "Recorded dividend payments by source",
  ["source"],
);
export const budgetsGauge = gauge("onabudget_budgets", "Budget periods");
export const marketSymbolsGauge = gauge(
  "onabudget_market_symbols",
  "Cached market symbols by lookup status",
  ["status"],
);
export const marketCandlesGauge = gauge(
  "onabudget_market_candles",
  "Cached daily close candles",
);
export const cdiRatesGauge = gauge(
  "onabudget_cdi_rates",
  "Cached daily CDI rates",
);

const collectDurationGauge = gauge(
  "onabudget_business_collect_duration_seconds",
  "Time the last business-gauge refresh took",
);

export const collectErrors = defineMetric(
  "onabudget_business_collect_errors_total",
  () =>
    new Counter({
      name: "onabudget_business_collect_errors_total",
      help: "Failed business-gauge refreshes",
      registers: [registry],
    }),
);

let lastRefreshAt = 0;
let inFlight: Promise<void> | null = null;

async function snapshot(): Promise<void> {
  const [
    users,
    activeSessions,
    accountsByType,
    expenseCount,
    transactionCount,
    dividendsBySource,
    budgetCount,
    symbolsByStatus,
    candleCount,
    cdiCount,
  ] = await Promise.all([
    db.select({ v: count() }).from(user),
    db
      .select({ v: count() })
      .from(session)
      .where(gt(session.expiresAt, new Date())),
    db
      .select({ accountType: accounts.accountType, v: count() })
      .from(accounts)
      .groupBy(accounts.accountType),
    db.select({ v: count() }).from(expenses),
    db.select({ v: count() }).from(investmentTransactions),
    db
      .select({ source: dividends.source, v: count() })
      .from(dividends)
      .groupBy(dividends.source),
    db.select({ v: count() }).from(budget),
    db
      .select({ status: marketSymbols.status, v: count() })
      .from(marketSymbols)
      .groupBy(marketSymbols.status),
    db.select({ v: count() }).from(marketCandles),
    db.select({ v: count() }).from(cdiRates),
  ]);

  usersGauge.set(users[0]?.v ?? 0);
  activeSessionsGauge.set(activeSessions[0]?.v ?? 0);
  expensesGauge.set(expenseCount[0]?.v ?? 0);
  investmentTransactionsGauge.set(transactionCount[0]?.v ?? 0);
  budgetsGauge.set(budgetCount[0]?.v ?? 0);
  marketCandlesGauge.set(candleCount[0]?.v ?? 0);
  cdiRatesGauge.set(cdiCount[0]?.v ?? 0);

  // Reset before setting grouped gauges, so a label that stops occurring (the
  // last INVESTMENT account being deleted, say) doesn't leave a stale series.
  accountsGauge.reset();
  for (const row of accountsByType) {
    accountsGauge.set({ account_type: row.accountType }, row.v);
  }

  dividendsGauge.reset();
  for (const row of dividendsBySource) {
    dividendsGauge.set({ source: row.source }, row.v);
  }

  marketSymbolsGauge.reset();
  for (const row of symbolsByStatus) {
    marketSymbolsGauge.set({ status: row.status }, row.v);
  }
}

/**
 * Refreshes every business gauge. Memoized, time-bounded, and never throws — a
 * failing gauge must not turn /api/metrics into a 500, or a DB problem would
 * take out the very metrics that reveal it.
 */
export async function refreshBusinessGauges(): Promise<void> {
  if (Date.now() - lastRefreshAt < MIN_REFRESH_MS) return;
  if (inFlight) return inFlight;

  const started = process.hrtime.bigint();

  inFlight = (async () => {
    try {
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        snapshot(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("business gauge refresh timed out")),
            COLLECT_TIMEOUT_MS,
          );
        }),
      ]).finally(() => clearTimeout(timer));

      collectDurationGauge.set(Number(process.hrtime.bigint() - started) / 1e9);
    } catch (error) {
      collectErrors.inc();
      console.error("[metrics] business gauge refresh failed:", error);
    } finally {
      lastRefreshAt = Date.now();
      inFlight = null;
    }
  })();

  return inFlight;
}
