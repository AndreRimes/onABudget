import { describe, expect, it } from "vitest";

import type { CandlePoint } from "~/server/services/brapi";
import type { QuoteResult } from "~/server/services/market-cache";
import {
  computePortfolioSnapshot,
  type EngineDividend,
  type EngineTransaction,
  type TimeRange,
} from "./portfolio-engine";

const ASSET_TYPES = new Map([[1, "Ações"]]);

function trade(overrides: Partial<EngineTransaction> = {}): EngineTransaction {
  return {
    assetName: "PETR4",
    assetTypeId: 1,
    transactionType: "BUY",
    quantity: 100,
    totalAmount: 1000,
    transactionDate: "2026-01-05",
    isFixedIncome: false,
    fixedIncomeYieldType: null,
    fixedIncomeRate: null,
    fixedIncomeMaturityDate: null,
    tesouroTitle: null,
    fundCnpj: null,
    ...overrides,
  };
}

function quote(price: number, previousClose = price): QuoteResult {
  return {
    price,
    previousClose,
    status: "ok",
    asOf: new Date("2026-01-10T21:00:00.000Z"),
  };
}

/** A flat candle series, so market value only moves when the test says so. */
function candles(points: Array<[string, number]>): CandlePoint[] {
  return points.map(([date, close]) => ({ date, close }));
}

function snapshot(input: {
  transactions: EngineTransaction[];
  dividends?: EngineDividend[];
  quotes?: Map<string, QuoteResult>;
  candles?: Map<string, CandlePoint[]>;
  tesouroCandles?: Map<string, CandlePoint[]>;
  fundCandles?: Map<string, CandlePoint[]>;
  assetLabels?: Map<string, string>;
  pinnedPrices?: Map<string, number>;
  benchmarks?: Map<string, Map<string, number>>;
  range?: TimeRange;
  today?: string;
  includeSeries?: boolean;
}) {
  return computePortfolioSnapshot({
    transactions: input.transactions,
    dividends: input.dividends ?? [],
    assetTypeNames: ASSET_TYPES,
    quotes: input.quotes ?? new Map<string, QuoteResult>(),
    candles: input.candles ?? new Map<string, CandlePoint[]>(),
    tesouroCandles: input.tesouroCandles ?? new Map<string, CandlePoint[]>(),
    fundCandles: input.fundCandles ?? new Map<string, CandlePoint[]>(),
    assetLabels: input.assetLabels ?? new Map<string, string>(),
    pinnedPrices: input.pinnedPrices,
    benchmarks: input.benchmarks ?? new Map<string, Map<string, number>>(),
    range: input.range ?? "max",
    today: input.today ?? "2026-01-10",
    includeSeries: input.includeSeries ?? true,
  });
}

describe("computePortfolioSnapshot", () => {
  it("returns an empty snapshot for an empty ledger", () => {
    const result = snapshot({ transactions: [] });

    expect(result.holdings).toEqual([]);
    expect(result.series).toEqual([]);
    expect(result.summary.totalValue).toBe(0);
    expect(result.summary.totalInvested).toBe(0);
  });

  describe("pinned prices", () => {
    it("marks today at the pinned price instead of the quote, and says so", () => {
      const result = snapshot({
        transactions: [trade({ quantity: 100, totalAmount: 1000 })],
        quotes: new Map([["PETR4", quote(12, 11)]]),
        pinnedPrices: new Map([["PETR4", 15]]),
      });

      const holding = result.holdings[0]!;
      expect(holding.currentPrice).toBe(15);
      expect(holding.currentValue).toBe(1500);
      expect(holding.priceStatus).toBe("provider");
      expect(result.summary.totalValue).toBe(1500);
    });

    it("leaves the history alone: only today's mark is the bank's", () => {
      const result = snapshot({
        transactions: [trade({ quantity: 100, totalAmount: 1000 })],
        candles: new Map([
          [
            "PETR4",
            candles([
              ["2026-01-05", 10],
              ["2026-01-09", 12],
            ]),
          ],
        ]),
        quotes: new Map([["PETR4", quote(12)]]),
        pinnedPrices: new Map([["PETR4", 15]]),
      });

      const byDate = new Map(result.series.map((p) => [p.date, p.value]));
      expect(byDate.get("2026-01-09")).toBe(1200);
      expect(byDate.get("2026-01-10")).toBe(1500);
    });

    it("silences the quote issue for a holding priced by the bank", () => {
      const result = snapshot({
        transactions: [trade({ quantity: 100, totalAmount: 1000 })],
        quotes: new Map([
          [
            "PETR4",
            {
              price: null,
              previousClose: null,
              status: "not_found",
              asOf: null,
            },
          ],
        ]),
        pinnedPrices: new Map([["PETR4", 15]]),
      });

      expect(result.issues).toEqual([]);
      expect(result.holdings[0]?.currentValue).toBe(1500);
    });
  });

  describe("cost basis", () => {
    it("averages successive buys", () => {
      const result = snapshot({
        transactions: [
          trade({ quantity: 100, totalAmount: 1000 }), // R$10.00
          trade({
            quantity: 100,
            totalAmount: 1400, // R$14.00
            transactionDate: "2026-01-06",
          }),
        ],
        quotes: new Map([["PETR4", quote(12)]]),
      });

      const holding = result.holdings[0]!;
      expect(holding.quantity).toBe(200);
      expect(holding.totalCost).toBeCloseTo(2400, 6);
      expect(holding.averageCost).toBeCloseTo(12, 6);
    });

    it("removes cost at the average price on a partial sell, not at the sale price", () => {
      // Selling half must leave half the cost behind. Booking the sale price
      // against cost instead would corrupt the average of everything left.
      const result = snapshot({
        transactions: [
          trade({ quantity: 100, totalAmount: 1000 }),
          trade({
            transactionType: "SELL",
            quantity: 50,
            totalAmount: 900, // sold at R$18, far above the R$10 average
            transactionDate: "2026-01-06",
          }),
        ],
        quotes: new Map([["PETR4", quote(18)]]),
      });

      const holding = result.holdings[0]!;
      expect(holding.quantity).toBe(50);
      expect(holding.totalCost).toBeCloseTo(500, 6);
      expect(holding.averageCost).toBeCloseTo(10, 6);
      // Realized gain = proceeds − cost removed = 900 − 500.
      expect(result.summary.realizedGain).toBeCloseTo(400, 6);
    });

    it("drops a fully sold position out of holdings", () => {
      const result = snapshot({
        transactions: [
          trade({ quantity: 100, totalAmount: 1000 }),
          trade({
            transactionType: "SELL",
            quantity: 100,
            totalAmount: 1200,
            transactionDate: "2026-01-06",
          }),
        ],
        quotes: new Map([["PETR4", quote(12)]]),
      });

      expect(result.holdings).toHaveLength(0);
      expect(result.summary.realizedGain).toBeCloseTo(200, 6);
    });
  });

  describe("net deposits", () => {
    it("counts buys in and sell proceeds out", () => {
      const result = snapshot({
        transactions: [
          trade({ quantity: 100, totalAmount: 1000 }),
          trade({
            transactionType: "SELL",
            quantity: 50,
            totalAmount: 600,
            transactionDate: "2026-01-06",
          }),
        ],
        quotes: new Map([["PETR4", quote(12)]]),
      });

      // Aportes = 1000 paid in − 600 taken out.
      expect(result.summary.totalInvested).toBeCloseTo(400, 6);
    });
  });

  describe("dividends", () => {
    it("adds them to total return without touching cost basis", () => {
      const result = snapshot({
        transactions: [trade({ quantity: 100, totalAmount: 1000 })],
        dividends: [
          { assetName: "PETR4", amount: 50, paymentDate: "2026-01-08" },
        ],
        quotes: new Map([["PETR4", quote(10)]]),
      });

      const holding = result.holdings[0]!;
      expect(holding.totalCost).toBeCloseTo(1000, 6);
      expect(holding.dividendsTotal).toBeCloseTo(50, 6);
      // Price unchanged, so the entire period gain is the dividend.
      expect(result.summary.periodGain).toBeCloseTo(50, 6);
    });

    it("ignores dividends of an asset that was never held", () => {
      const result = snapshot({
        transactions: [trade()],
        dividends: [
          { assetName: "VALE3", amount: 90, paymentDate: "2026-01-08" },
        ],
        quotes: new Map([["PETR4", quote(10)]]),
      });

      expect(result.holdings).toHaveLength(1);
      expect(result.holdings[0]!.dividendsTotal).toBe(0);
    });
  });

  describe("market value", () => {
    it("uses the live quote for the closing value", () => {
      const result = snapshot({
        transactions: [trade({ quantity: 100, totalAmount: 1000 })],
        quotes: new Map([["PETR4", quote(15)]]),
      });

      expect(result.summary.totalValue).toBeCloseTo(1500, 6);
      expect(result.holdings[0]!.unrealizedGain).toBeCloseTo(500, 6);
      expect(result.holdings[0]!.unrealizedGainPercent).toBeCloseTo(50, 6);
    });

    it("surfaces an unusable quote as an issue instead of a silent zero", () => {
      const result = snapshot({
        transactions: [trade()],
        quotes: new Map([
          [
            "PETR4",
            {
              price: null,
              previousClose: null,
              status: "not_found",
              asOf: null,
            },
          ],
        ]),
      });

      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toMatchObject({
        assetName: "PETR4",
        status: "not_found",
      });
    });
  });

  describe("series", () => {
    it("is skipped entirely when not requested", () => {
      const result = snapshot({
        transactions: [trade()],
        quotes: new Map([["PETR4", quote(10)]]),
        includeSeries: false,
      });

      expect(result.series).toEqual([]);
      // The summary is still computed — that is the point of the flag.
      expect(result.summary.totalValue).toBeCloseTo(1000, 6);
    });

    it("is anchored to zero gain at the range start", () => {
      const result = snapshot({
        transactions: [trade({ quantity: 100, totalAmount: 1000 })],
        quotes: new Map([["PETR4", quote(11)]]),
        candles: new Map([
          [
            "PETR4",
            candles([
              ["2026-01-05", 10],
              ["2026-01-06", 10],
              ["2026-01-07", 10],
              ["2026-01-08", 10],
              ["2026-01-09", 10],
              ["2026-01-10", 11],
            ]),
          ],
        ]),
      });

      expect(result.series[0]!.gain).toBeCloseTo(0, 6);
      expect(result.series.at(-1)!.date).toBe("2026-01-10");
    });

    it("runs in date order with no gaps at the end", () => {
      const result = snapshot({
        transactions: [trade()],
        quotes: new Map([["PETR4", quote(10)]]),
      });

      const dates = result.series.map((point) => point.date);
      expect([...dates].sort()).toEqual(dates);
      expect(dates.at(-1)).toBe("2026-01-10");
    });

    it("ends on the same invested figure the summary reports", () => {
      // The "Total Investido" card and the chart's last point are the same
      // quantity; letting them drift is exactly the bug this pins down.
      const result = snapshot({
        transactions: [
          trade({ quantity: 100, totalAmount: 1000 }),
          trade({
            quantity: 50,
            totalAmount: 700,
            transactionDate: "2026-01-07",
          }),
        ],
        quotes: new Map([["PETR4", quote(12)]]),
      });

      expect(result.series.at(-1)!.invested).toBeCloseTo(
        result.summary.totalInvested,
        6,
      );
    });
  });

  describe("fixed income", () => {
    it("accrues a prefixed holding above its cost", () => {
      const result = snapshot({
        transactions: [
          trade({
            assetName: "CDB BANCO X",
            quantity: 1,
            totalAmount: 1000,
            transactionDate: "2025-01-10",
            isFixedIncome: true,
            fixedIncomeYieldType: "PREFIXED",
            fixedIncomeRate: 12,
          }),
        ],
        today: "2026-01-10",
      });

      const holding = result.holdings[0]!;
      expect(holding.priceStatus).toBe("fixed_income");
      // A year at 12% a.a. lands near 1120, and must at minimum have grown.
      expect(holding.currentValue).toBeGreaterThan(1000);
      expect(holding.currentValue).toBeCloseTo(1120, 0);
    });

    it("does not accrue a CDI holding without a rate series", () => {
      const result = snapshot({
        transactions: [
          trade({
            assetName: "CDB CDI",
            quantity: 1,
            totalAmount: 1000,
            transactionDate: "2025-01-10",
            isFixedIncome: true,
            fixedIncomeYieldType: "CDI_PERCENTAGE",
            fixedIncomeRate: 110,
          }),
        ],
        today: "2026-01-10",
      });

      // No CDI series was supplied, so the honest answer is "still worth what
      // was paid" rather than an invented yield.
      expect(result.holdings[0]!.currentValue).toBeCloseTo(1000, 6);
    });

    it("raises no quote issue for a fixed-income holding", () => {
      const result = snapshot({
        transactions: [
          trade({
            assetName: "CDB BANCO X",
            isFixedIncome: true,
            fixedIncomeYieldType: "PREFIXED",
            fixedIncomeRate: 12,
          }),
        ],
      });

      expect(result.issues).toHaveLength(0);
    });
  });

  describe("funds", () => {
    const fund = (overrides = {}) =>
      trade({
        assetName: "28.947.266/0001-65",
        fundCnpj: "28947266000165",
        quantity: 100,
        totalAmount: 200,
        transactionDate: "2026-01-05",
        ...overrides,
      });

    it("marks a fund to its published quota", () => {
      const result = snapshot({
        transactions: [fund()],
        fundCandles: new Map([
          [
            "28.947.266/0001-65",
            candles([
              ["2026-01-05", 2],
              ["2026-01-08", 2.25],
            ]),
          ],
        ]),
      });

      const holding = result.holdings[0]!;
      expect(holding.currentPrice).toBeCloseTo(2.25, 6);
      expect(holding.currentValue).toBeCloseTo(225, 6);
      expect(holding.unrealizedGain).toBeCloseTo(25, 6);
      expect(holding.priceStatus).toBe("ok");
    });

    it("keeps the last quota on days the fund has not published yet", () => {
      // The CVM publishes a few business days late by design, so the last
      // point in the series is the price for every day after it.
      const result = snapshot({
        transactions: [fund()],
        fundCandles: new Map([
          ["28.947.266/0001-65", candles([["2026-01-07", 2.5]])],
        ]),
        today: "2026-01-10",
      });

      expect(result.holdings[0]!.currentValue).toBeCloseTo(250, 6);
    });

    it("never asks the quote provider about a fund", () => {
      // The asset name is a CNPJ: a live quote for it can only ever come back
      // "not found", and must not be allowed to overwrite the quota price.
      const result = snapshot({
        transactions: [fund()],
        fundCandles: new Map([
          ["28.947.266/0001-65", candles([["2026-01-08", 2.25]])],
        ]),
        quotes: new Map([
          [
            "28.947.266/0001-65",
            {
              price: 99,
              previousClose: 99,
              status: "not_found" as const,
              asOf: null,
            },
          ],
        ]),
      });

      expect(result.holdings[0]!.currentPrice).toBeCloseTo(2.25, 6);
      expect(result.issues).toHaveLength(0);
    });

    it("reports an unpriced fund instead of pretending it is current", () => {
      const result = snapshot({ transactions: [fund()] });

      const holding = result.holdings[0]!;
      expect(holding.priceStatus).toBe("unavailable");
      // Falls back to what was paid, exactly as an unpriced equity does.
      expect(holding.currentValue).toBeCloseTo(200, 6);
    });

    it("prints the provider's name for the holding when there is one", () => {
      const result = snapshot({
        transactions: [fund()],
        assetLabels: new Map([
          ["28.947.266/0001-65", "ACE Capital Advisory FIF CIC Multi RL"],
        ]),
      });

      expect(result.holdings[0]!.label).toBe(
        "ACE Capital Advisory FIF CIC Multi RL",
      );
      // The key itself never changes: it is what every price source is keyed by.
      expect(result.holdings[0]!.assetName).toBe("28.947.266/0001-65");
    });
  });

  describe("today's change", () => {
    it("is zero for a portfolio whose only day is today", () => {
      const result = snapshot({
        transactions: [trade({ transactionDate: "2026-01-10" })],
        quotes: new Map([["PETR4", quote(10)]]),
        today: "2026-01-10",
      });

      expect(result.summary.dailyChange).toBe(0);
    });
  });
});
