import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { emptyMarketDataStatus } from "~/lib/market-data";
import { seedBaseline, type TestDb } from "~/test/db";
import type * as Brapi from "./brapi";

vi.mock("~/server/db", async () => {
  const { createTestDb } = await import("~/test/db");
  return { db: await createTestDb() };
});
vi.mock("./brapi", async () => {
  const actual = await vi.importActual<typeof Brapi>("./brapi");
  return {
    ...actual,
    fetchQuotes: vi.fn(async () => ({ quotes: new Map(), failed: [] })),
    fetchCandles: vi.fn(async () => []),
    fetchCdiDailyRates: vi.fn(async () => []),
    fetchBcbMonthlyRates: vi.fn(async () => []),
    fetchYahooDailyCloses: vi.fn(async () => []),
    fetchTesouroPrices: vi.fn(async () => []),
  };
});
vi.mock("./cvm-funds", () => ({ fetchFundQuotas: vi.fn(async () => []) }));

const { db } = (await import("~/server/db")) as unknown as { db: TestDb };
const schema = await import("~/server/db/schema");
const providers = await import("./brapi");
const { fetchFundQuotas } = await import("./cvm-funds");
const { MarketCacheService, todayIso } = await import("./market-cache");
const { InvestmentRepository } =
  await import("~/server/api/investments/repository");
const calls = [
  providers.fetchQuotes,
  providers.fetchCandles,
  providers.fetchCdiDailyRates,
  providers.fetchBcbMonthlyRates,
  providers.fetchYahooDailyCloses,
  providers.fetchTesouroPrices,
  fetchFundQuotas,
];
let baseline: Awaited<ReturnType<typeof seedBaseline>>;

beforeAll(async () => {
  baseline = await seedBaseline(db);
  await db.insert(schema.investmentTransactions).values({
    investmentAccountId: baseline.investmentAccountId,
    assetTypeId: baseline.assetTypeId,
    assetName: "READ4",
    transactionType: "BUY",
    quantity: 10,
    pricePerUnit: 10,
    totalAmount: 100,
    transactionDate: todayIso(),
  });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("local market reads", () => {
  it("reads every market source with an empty cache without calling providers", async () => {
    const cache = new MarketCacheService();
    const status = emptyMarketDataStatus();
    const options = { readOnly: status };
    await Promise.all([
      cache.getQuotes(["EMPTY4"], options),
      cache.getCandles(["EMPTY4"], "2026-01-01", options),
      cache.getBenchmarks(
        ["CDI", "IBOV", "IPCA", "POUPANCA"],
        "2026-01-01",
        options,
      ),
      cache.getTesouroPrices(["TESOURO IPCA+ 2050"], "2026-01-01", options),
      cache.getFundQuotas(["12345678000190"], "2026-01-01", options),
    ]);
    expect(status).toEqual({
      needsRefresh: true,
      isPartial: true,
      oldestAvailableAsOf: null,
    });
    for (const call of calls) expect(call).not.toHaveBeenCalled();
  });

  it("preserves expired quotes and differentiates fresh and negative cache entries", async () => {
    const cache = new MarketCacheService();
    const old = new Date(Date.now() - 3_600_000);
    await db.insert(schema.marketSymbols).values([
      { symbol: "OLD4", status: "OK", lastPrice: 42, lastPriceAt: old },
      {
        symbol: "FRESH4",
        status: "OK",
        lastPrice: 50,
        lastPriceAt: new Date(),
      },
      { symbol: "UNKNOWN4", status: "NOT_FOUND", updatedAt: new Date() },
    ]);
    const status = emptyMarketDataStatus();
    const quotes = await cache.getQuotes(["OLD4"], { readOnly: status });
    expect(quotes.get("OLD4")).toMatchObject({ price: 42, status: "stale" });
    expect(status).toEqual({
      needsRefresh: true,
      isPartial: false,
      oldestAvailableAsOf: old.toISOString(),
    });
    const fresh = emptyMarketDataStatus();
    await cache.getQuotes(["FRESH4", "UNKNOWN4"], { readOnly: fresh });
    expect(fresh.needsRefresh).toBe(false);
    expect(providers.fetchQuotes).not.toHaveBeenCalled();
  });

  it("keeps a snapshot usable while refresh waits and reads edits made during refresh", async () => {
    const repo = new InvestmentRepository();
    let release!: (
      value: Awaited<ReturnType<typeof providers.fetchQuotes>>,
    ) => void;
    vi.mocked(providers.fetchQuotes).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const refreshing = repo.refreshMarketData(baseline.userId);
    const duplicate = repo.refreshMarketData(baseline.userId);
    expect(duplicate).toBe(refreshing);
    await vi.waitFor(() =>
      expect(providers.fetchQuotes).toHaveBeenCalledOnce(),
    );
    try {
      const before = await repo.getPortfolioSnapshot(baseline.userId);
      expect(before.holdings[0]?.quantity).toBe(10);
      expect(before.marketData.isPartial).toBe(true);
      await db
        .update(schema.investmentTransactions)
        .set({ quantity: 20, totalAmount: 200 })
        .where(eq(schema.investmentTransactions.assetName, "READ4"));
      const during = await repo.getPortfolioSnapshot(baseline.userId);
      expect(during.holdings[0]?.quantity).toBe(20);
      const stranger = await repo.getPortfolioSnapshot("another-user");
      expect(stranger.holdings).toEqual([]);
      expect(stranger.marketData.needsRefresh).toBe(false);
    } finally {
      release({
        quotes: new Map([
          [
            "READ4",
            { symbol: "READ4", regularMarketPrice: 12 } as Brapi.BrapiQuote,
          ],
        ]),
        failed: [],
      });
      await refreshing;
    }
    const after = await repo.getPortfolioSnapshot(baseline.userId);
    expect(after.holdings[0]).toMatchObject({ quantity: 20, currentPrice: 12 });
    const cooldown = await repo.refreshMarketData(baseline.userId);
    expect(cooldown.outcome).toBe("cooldown");
    expect(providers.fetchQuotes).toHaveBeenCalledOnce();
  });

  it("backs off failed resources across callers and recovers without losing the previous price", async () => {
    const cache = new MarketCacheService();
    vi.useFakeTimers({ toFake: ["Date"] });
    await db.insert(schema.marketSymbols).values({
      symbol: "FAIL4",
      status: "OK",
      lastPrice: 25,
      lastPriceAt: new Date(0),
    });
    vi.mocked(providers.fetchQuotes).mockResolvedValueOnce({
      quotes: new Map(),
      failed: ["FAIL4"],
    });
    expect((await cache.getQuotes(["FAIL4"])).get("FAIL4")?.price).toBe(25);
    await cache.getQuotes(["FAIL4"]);
    expect(providers.fetchQuotes).toHaveBeenCalledOnce();
    vi.setSystemTime(Date.now() + 60_001);
    vi.mocked(providers.fetchQuotes).mockResolvedValueOnce({
      quotes: new Map([
        [
          "FAIL4",
          { symbol: "FAIL4", regularMarketPrice: 26 } as Brapi.BrapiQuote,
        ],
      ]),
      failed: [],
    });
    expect((await cache.getQuotes(["FAIL4"])).get("FAIL4")?.price).toBe(26);
    expect(providers.fetchQuotes).toHaveBeenCalledTimes(2);
  });

  it("backfills fund months progressively without downloading covered months again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    const cache = new MarketCacheService();
    const cnpj = "98765432000199";
    vi.mocked(fetchFundQuotas).mockImplementation(async ({ month }) => {
      vi.setSystemTime(Date.now() + 21_000);
      return [{ cnpj, date: `${month}-15`, quota: 10 }];
    });
    try {
      for (let pass = 0; pass < 3; pass++) {
        await cache.getFundQuotas([cnpj], "2026-08-15");
        const status = emptyMarketDataStatus();
        const series = await cache.getFundQuotas([cnpj], "2026-08-15", {
          readOnly: status,
        });
        expect(series.get(cnpj)).toHaveLength(pass + 1);
        expect(status.needsRefresh).toBe(pass < 2);
        vi.setSystemTime(Date.now() + 60_000);
      }
      await cache.getFundQuotas([cnpj], "2026-08-15");
      expect(
        vi.mocked(fetchFundQuotas).mock.calls.map(([input]) => input.month),
      ).toEqual(["2026-10", "2026-09", "2026-08"]);
    } finally {
      vi.mocked(fetchFundQuotas).mockResolvedValue([]);
    }
  });

  it("preserves the forced quote refresh response and bypasses the quote TTL", async () => {
    const repo = new InvestmentRepository();
    vi.mocked(providers.fetchQuotes).mockResolvedValueOnce({
      quotes: new Map([
        [
          "READ4",
          { symbol: "READ4", regularMarketPrice: 13 } as Brapi.BrapiQuote,
        ],
      ]),
      failed: [],
    });
    const result = await repo.refreshQuotes(baseline.userId, "READ4");
    expect(result).toMatchObject({
      quotes: [{ assetName: "READ4", price: 13, status: "ok" }],
    });
    expect(new Date(result.refreshedAt).getTime()).not.toBeNaN();
    expect(providers.fetchQuotes).toHaveBeenCalledOnce();
    const stranger = await repo.refreshQuotes("another-user", "READ4");
    expect(stranger.quotes).toEqual([]);
    expect(providers.fetchQuotes).toHaveBeenCalledOnce();
  });

  it("reports provider failures even when a different resource updates successfully", async () => {
    const repo = new InvestmentRepository();
    await db.insert(schema.investmentTransactions).values({
      investmentAccountId: baseline.investmentAccountId,
      assetTypeId: baseline.assetTypeId,
      assetName: "ERROR4",
      transactionType: "BUY",
      quantity: 1,
      pricePerUnit: 20,
      totalAmount: 20,
      transactionDate: todayIso(),
    });
    vi.mocked(providers.fetchQuotes).mockResolvedValueOnce({
      quotes: new Map(),
      failed: ["ERROR4"],
    });
    const result = await repo.refreshMarketData(baseline.userId, "ERROR4");
    expect(result.outcome).toBe("failed");
    expect(result.needsMore).toBe(true);
    const snapshot = await repo.getPortfolioSnapshot(
      baseline.userId,
      "max",
      true,
      "ERROR4",
    );
    expect(snapshot.holdings[0]?.quantity).toBe(1);
    expect(snapshot.marketData.needsRefresh).toBe(true);
  });
});
