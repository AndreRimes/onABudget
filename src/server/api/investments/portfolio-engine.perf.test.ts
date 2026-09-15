// A budget on the engine's replay, so a change that makes it quadratic — a
// `.filter()` inside the day loop, a per-day copy of the ledger — fails here
// instead of showing up as a slow dashboard months later.
//
// The ledger is synthetic but shaped like a real one: several years of daily
// candles for dozens of assets, a few hundred trades, dividends, benchmarks.
// The budget is deliberately loose — the replay takes ~17 ms here, the budget
// is 500 — so it does not flake on a busy CI runner; it exists to catch
// regressions of kind (a quadratic loop is seconds), not of degree.
import { describe, expect, it } from "vitest";

import type { CandlePoint } from "~/server/services/brapi";
import type { QuoteResult } from "~/server/services/market-cache";
import {
  computePortfolioSnapshot,
  type EngineDividend,
  type EngineTransaction,
} from "./portfolio-engine";

const TODAY = "2026-09-15";
const START = "2023-09-15";
const ASSETS = 40;
const BUDGET_MS = 500;

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

/** Deterministic pseudo-randomness, so the ledger is the same on every run. */
function lcg(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

function buildLedger() {
  const random = lcg(42);
  const days = daysBetween(START, TODAY);
  const assets = Array.from({ length: ASSETS }, (_, index) => `ATV${index}`);

  const transactions: EngineTransaction[] = [];
  const dividends: EngineDividend[] = [];
  const candles = new Map<string, CandlePoint[]>();
  const quotes = new Map<string, QuoteResult>();

  for (const assetName of assets) {
    // A daily candle series per asset, drifting upward with noise.
    let price = 10 + random() * 90;
    const series: CandlePoint[] = [];
    for (const day of days) {
      price *= 1 + (random() - 0.49) * 0.02;
      series.push({ date: day, close: Number(price.toFixed(2)) });
    }
    candles.set(assetName, series);
    quotes.set(assetName, {
      price: series[series.length - 1]!.close,
      previousClose: series[series.length - 2]!.close,
      status: "ok",
      asOf: new Date(`${TODAY}T21:00:00.000Z`),
    });

    // Eight trades and a few dividends spread over the period.
    for (let trade = 0; trade < 8; trade++) {
      const dayIndex = Math.floor(random() * days.length);
      const quantity = 10 + Math.floor(random() * 50);
      const close = series[dayIndex]!.close;
      transactions.push({
        assetName,
        assetTypeId: 1,
        transactionType: trade % 4 === 3 ? "SELL" : "BUY",
        quantity: trade % 4 === 3 ? Math.min(quantity, 10) : quantity,
        totalAmount: Number((quantity * close).toFixed(2)),
        transactionDate: days[dayIndex]!,
        isFixedIncome: false,
        fixedIncomeYieldType: null,
        fixedIncomeRate: null,
        fixedIncomeMaturityDate: null,
        tesouroTitle: null,
        fundCnpj: null,
      });
    }
    for (let payout = 0; payout < 6; payout++) {
      dividends.push({
        assetName,
        amount: Number((random() * 50).toFixed(2)),
        paymentDate: days[Math.floor(random() * days.length)]!,
      });
    }
  }

  const benchmarks = new Map<string, Map<string, number>>();
  for (const id of ["CDI", "IBOV", "IPCA", "POUPANCA"]) {
    benchmarks.set(id, new Map(days.map((day) => [day, 0.0004])));
  }

  return { transactions, dividends, candles, quotes, benchmarks, days };
}

describe("computePortfolioSnapshot under a realistic load", () => {
  const ledger = buildLedger();

  it("replays three years of forty assets within budget", () => {
    // Warm once so JIT and allocation noise do not land on the measurement.
    computePortfolioSnapshot({
      transactions: ledger.transactions,
      dividends: ledger.dividends,
      assetTypeNames: new Map([[1, "Ações"]]),
      assetLabels: new Map(),
      quotes: ledger.quotes,
      candles: ledger.candles,
      tesouroCandles: new Map(),
      fundCandles: new Map(),
      benchmarks: ledger.benchmarks,
      range: "max",
      today: TODAY,
      includeSeries: true,
    });

    const started = performance.now();
    const snapshot = computePortfolioSnapshot({
      transactions: ledger.transactions,
      dividends: ledger.dividends,
      assetTypeNames: new Map([[1, "Ações"]]),
      assetLabels: new Map(),
      quotes: ledger.quotes,
      candles: ledger.candles,
      tesouroCandles: new Map(),
      fundCandles: new Map(),
      benchmarks: ledger.benchmarks,
      range: "max",
      today: TODAY,
      includeSeries: true,
    });
    const elapsed = performance.now() - started;

    // Sanity: it did the whole job, not a shortcut.
    expect(snapshot.series).toHaveLength(ledger.days.length);
    expect(snapshot.holdings.length).toBeGreaterThan(0);

    expect(
      elapsed,
      `replay took ${elapsed.toFixed(1)} ms, budget ${BUDGET_MS} ms`,
    ).toBeLessThan(BUDGET_MS);
  });
});
