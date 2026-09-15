// The quote cache in front of brapi: what it stores, what it serves from the
// store, and what it asks upstream for. It had no test, and the write path was
// just rewritten from one statement per symbol to one per batch — a batch that
// wrote the wrong column would only have shown up as a wrong price on screen.
import { beforeAll, describe, expect, it, vi } from "vitest";

import type * as brapi from "~/server/services/brapi";
import type { BrapiQuote } from "~/server/services/brapi";
import { type TestDb } from "~/test/db";

const fetchQuotes = vi.fn<
  (symbols: string[]) => Promise<{
    quotes: Map<string, BrapiQuote>;
    failed: string[];
  }>
>();

vi.mock("~/server/db", async () => {
  const { createTestDb } = await import("~/test/db");
  return { db: await createTestDb() };
});

vi.mock("~/server/services/brapi", async () => {
  const actual = await vi.importActual<typeof brapi>("~/server/services/brapi");
  return {
    ...actual,
    fetchQuotes: (symbols: string[]) => fetchQuotes(symbols),
  };
});

const { db } = (await import("~/server/db")) as unknown as { db: TestDb };
const { marketSymbols } = await import("~/server/db/schema");
const { marketCacheService } = await import("./market-cache");

function quote(symbol: string, price: number): BrapiQuote {
  return {
    symbol,
    shortName: symbol,
    longName: symbol,
    currency: "BRL",
    regularMarketPrice: price,
    regularMarketPreviousClose: price - 1,
    regularMarketChange: 1,
    regularMarketChangePercent: 1,
  } as BrapiQuote;
}

beforeAll(async () => {
  // A row that was already known, so the "not found" path has a price to keep.
  await db.insert(marketSymbols).values({
    symbol: "OLD11",
    status: "OK",
    lastPrice: 99,
    previousClose: 98,
    lastPriceAt: new Date("2020-01-01T00:00:00Z"),
    updatedAt: new Date("2020-01-01T00:00:00Z"),
  });
});

describe("marketCacheService.getQuotes", () => {
  it("stores every fetched quote and serves each from the store afterwards", async () => {
    fetchQuotes.mockResolvedValueOnce({
      quotes: new Map([
        ["PETR4", quote("PETR4", 38.5)],
        ["VALE3", quote("VALE3", 61.2)],
      ]),
      failed: [],
    });

    const first = await marketCacheService.getQuotes(["PETR4", "VALE3"]);

    expect(first.get("PETR4")).toMatchObject({ price: 38.5, status: "ok" });
    expect(first.get("VALE3")).toMatchObject({ price: 61.2, status: "ok" });
    expect(fetchQuotes).toHaveBeenCalledTimes(1);

    const rows = await db.select().from(marketSymbols);
    expect(
      Object.fromEntries(
        rows
          .filter((row) => row.symbol !== "OLD11")
          .map((row) => [row.symbol, [row.status, row.lastPrice]]),
      ),
    ).toEqual({ PETR4: ["OK", 38.5], VALE3: ["OK", 61.2] });

    // Inside the TTL nothing goes upstream again.
    const second = await marketCacheService.getQuotes(["PETR4", "VALE3"]);
    expect(second.get("PETR4")?.price).toBe(38.5);
    expect(fetchQuotes).toHaveBeenCalledTimes(1);
  });

  it("marks a symbol brapi does not know without erasing its last price", async () => {
    fetchQuotes.mockResolvedValueOnce({ quotes: new Map(), failed: [] });

    const result = await marketCacheService.getQuotes(["OLD11"]);

    expect(result.get("OLD11")?.status).toBe("not_found");
    const [row] = await db
      .select()
      .from(marketSymbols)
      .where((await import("drizzle-orm")).eq(marketSymbols.symbol, "OLD11"));
    expect(row).toMatchObject({ status: "NOT_FOUND", lastPrice: 99 });
  });
});
