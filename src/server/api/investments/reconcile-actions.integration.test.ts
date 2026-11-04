// Agreeing with the bank, end to end: a bank fact and a ledger go in, the
// ledger is settled in the bank's favour, and the next snapshot reflects it.
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { seedBaseline, type TestDb } from "~/test/db";
import type { QuoteResult } from "~/server/services/market-cache";

vi.mock("~/server/db", async () => {
  const { createTestDb } = await import("~/test/db");
  return { db: await createTestDb() };
});

// No market data in these tests: an asset with a quote is priced by it, one
// without is priced at its average cost. Either way the value is arithmetic
// the test controls, which is what makes a bank figure comparable to it.
const quotes = new Map<string, QuoteResult>();
let today = "2026-09-17";
vi.mock("~/server/services/market-cache", () => ({
  todayIso: () => today,
  marketCacheService: {
    getQuotes: async (symbols: string[]) =>
      new Map(
        symbols
          .filter((symbol) => quotes.has(symbol))
          .map((symbol) => [symbol, quotes.get(symbol)!]),
      ),
    getCandles: async () => new Map(),
    getBenchmarks: async () => new Map(),
    getTesouroPrices: async () => new Map(),
    getFundQuotas: async () => new Map(),
  },
}));

const { db } = (await import("~/server/db")) as unknown as { db: TestDb };
const { accounts, investmentTransactions, providerHoldings } =
  await import("~/server/db/schema");
const { investmentRepository } = await import("./repository");
const { bankPosition, reconcileWithBank, settleQuantity } =
  await import("./reconcile-actions");

let baseline: Awaited<ReturnType<typeof seedBaseline>>;
const SYNCED_AT = new Date("2026-09-15T12:00:00Z");

beforeAll(async () => {
  baseline = await seedBaseline(db);
});

beforeEach(async () => {
  // A clean slate per test: every row in these tables is this file's own.
  /* eslint-disable drizzle/enforce-delete-with-where */
  await db.delete(investmentTransactions);
  await db.delete(providerHoldings);
  /* eslint-enable drizzle/enforce-delete-with-where */
  quotes.clear();
  today = "2026-09-17";
});

function quote(
  price: number,
  status: QuoteResult["status"] = "ok",
): QuoteResult {
  return {
    price,
    previousClose: price,
    status,
    asOf: new Date("2026-09-17T20:00:00Z"),
  };
}

async function buy(
  assetName: string,
  quantity: number,
  pricePerUnit: number,
  transactionDate = "2026-03-10",
) {
  await db.insert(investmentTransactions).values({
    investmentAccountId: baseline.investmentAccountId,
    assetTypeId: baseline.assetTypeId,
    assetName,
    transactionType: "BUY",
    quantity,
    pricePerUnit,
    totalAmount: quantity * pricePerUnit,
    transactionDate,
    isFixedIncome: false,
  });
}

async function bankSays(
  assetName: string,
  figures: {
    quantity: number;
    value: number;
    profit?: number | null;
    applied?: number | null;
  },
  userId = baseline.userId,
  syncedAt = SYNCED_AT,
) {
  await db
    .insert(providerHoldings)
    .values({
      userId,
      assetName,
      quantity: figures.quantity,
      value: figures.value,
      profit: figures.profit ?? null,
      applied: figures.applied ?? null,
      syncedAt,
    })
    .onConflictDoUpdate({
      target: [providerHoldings.userId, providerHoldings.assetName],
      set: {
        quantity: figures.quantity,
        value: figures.value,
        profit: figures.profit ?? null,
        applied: figures.applied ?? null,
        syncedAt,
      },
    });
}

async function entryFor(assetName: string) {
  const snapshot = await investmentRepository.getPortfolioSnapshot(
    baseline.userId,
    "max",
    false,
  );
  return {
    entry: snapshot.reconciliation.entries.find(
      (entry) => entry.assetName === assetName,
    ),
    holding: snapshot.holdings.find(
      (holding) => holding.assetName === assetName,
    ),
    reconciliation: snapshot.reconciliation,
  };
}

async function ledgerRows(assetName: string) {
  return await db
    .select()
    .from(investmentTransactions)
    .where(eq(investmentTransactions.assetName, assetName));
}

describe("the bank's figures as today's mark", () => {
  it("keeps a fresh quote for a listed asset, with the bank's cost", async () => {
    await buy("PETR3", 14, 30);
    quotes.set("PETR3", quote(40)); // market: 560
    // The bank priced it at yesterday's close and says it cost R$520.
    await bankSays("PETR3", { quantity: 14, value: 590, profit: 70 });

    const { holding } = await entryFor("PETR3");
    expect(holding?.currentValue).toBeCloseTo(560, 6);
    expect(holding?.priceStatus).toBe("ok");
    expect(holding?.totalCost).toBeCloseTo(520, 6);
    expect(holding?.unrealizedGain).toBeCloseTo(40, 6);
    // The trades keep their amounts: cross-source dedup matches on them.
    expect((await ledgerRows("PETR3")).map((row) => row.totalAmount)).toEqual([
      420,
    ]);
  });

  it("takes the bank's value when the quote is not fresh", async () => {
    await buy("PETR3", 14, 30);
    quotes.set("PETR3", quote(40, "stale"));
    await bankSays("PETR3", { quantity: 14, value: 590, profit: 170 });

    const { entry, holding } = await entryFor("PETR3");
    expect(holding?.currentValue).toBeCloseTo(590, 6);
    expect(holding?.priceStatus).toBe("provider");
    expect(holding?.unrealizedGain).toBeCloseTo(170, 6);
    expect(entry?.cause).toBe("match");
  });

  it("marks accrual fixed income at the bank's figure", async () => {
    await db.insert(investmentTransactions).values({
      investmentAccountId: baseline.investmentAccountId,
      assetTypeId: baseline.assetTypeId,
      assetName: "CDB X",
      transactionType: "BUY",
      quantity: 1,
      pricePerUnit: 1000,
      totalAmount: 1000,
      transactionDate: "2026-03-10",
      isFixedIncome: true,
      fixedIncomeYieldType: "PREFIXED",
      fixedIncomeRate: 12,
    });
    await bankSays("CDB X", { quantity: 1, value: 1100, profit: 100 });

    const { entry, holding } = await entryFor("CDB X");
    expect(holding?.currentValue).toBeCloseTo(1100, 6);
    expect(entry?.cause).toBe("match");
  });

  it("takes the position value when the bank reports no quantity", async () => {
    await buy("PETR3", 14, 30);
    await db.insert(providerHoldings).values({
      userId: baseline.userId,
      assetName: "PETR3",
      quantity: null,
      value: 575,
      syncedAt: SYNCED_AT,
    });

    expect((await entryFor("PETR3")).holding?.currentValue).toBeCloseTo(575, 6);
  });

  it("falls back to what the bank says was applied for the cost", async () => {
    await buy("PETR3", 14, 30);
    await bankSays("PETR3", { quantity: 14, value: 560, applied: 500 });

    expect((await entryFor("PETR3")).holding?.totalCost).toBeCloseTo(500, 6);
  });

  it("yields to the ledger once the bank's figure stops arriving", async () => {
    await buy("PETR3", 14, 30);
    quotes.set("PETR3", quote(40, "stale"));
    await bankSays(
      "PETR3",
      { quantity: 14, value: 590, profit: 70 },
      baseline.userId,
      new Date("2026-09-10T12:00:00Z"), // a week before "today"
    );

    const { holding } = await entryFor("PETR3");
    expect(holding?.currentValue).toBeCloseTo(560, 6);
    expect(holding?.totalCost).toBeCloseTo(420, 6);
  });
});

describe("settleQuantity", () => {
  it("books the missing units as a buy at the bank's unit cost", async () => {
    // The ledger knows 6 of 14 shares; the bank says the 14 cost R$420.
    await buy("PETR3", 6, 30, "2026-03-10");
    await bankSays("PETR3", { quantity: 14, value: 560, profit: 140 });

    expect(await settleQuantity(baseline.userId, "PETR3")).toBe(true);

    const plug = (await ledgerRows("PETR3")).find((row) => row.sourceHash);
    expect(plug).toMatchObject({
      investmentAccountId: baseline.investmentAccountId,
      assetTypeId: baseline.assetTypeId,
      transactionType: "BUY",
      quantity: 8,
      pricePerUnit: 30,
      totalAmount: 240,
      transactionDate: "2026-03-09",
      sourceHash: `${baseline.userId}:reconcile:PETR3`,
    });
    expect((await entryFor("PETR3")).holding?.quantity).toBe(14);
  });

  it("adds units that came at no cost without inventing a deposit", async () => {
    // A 2:1 split the bank never reported as a movement: twice the units,
    // the same R$300 cost.
    await buy("PETR3", 10, 30);
    await bankSays("PETR3", { quantity: 20, value: 600, profit: 300 });

    await settleQuantity(baseline.userId, "PETR3");

    const plug = (await ledgerRows("PETR3")).find((row) => row.sourceHash);
    expect(plug).toMatchObject({ quantity: 10, totalAmount: 0 });
    const snapshot = await investmentRepository.getPortfolioSnapshot(
      baseline.userId,
      "max",
      false,
    );
    expect(snapshot.summary.totalInvested).toBeCloseTo(300, 6);
  });

  it("books surplus units as a sell dated today", async () => {
    await buy("PETR3", 20, 30);
    await bankSays("PETR3", { quantity: 14, value: 560 });

    await settleQuantity(baseline.userId, "PETR3");

    const plug = (await ledgerRows("PETR3")).find((row) => row.sourceHash);
    expect(plug).toMatchObject({
      transactionType: "SELL",
      quantity: 6,
      totalAmount: 240,
      transactionDate: "2026-09-17",
    });
    expect((await entryFor("PETR3")).holding?.quantity).toBe(14);
  });

  it("keeps a sale as it was booked while the surplus stays the same", async () => {
    await buy("PETR3", 20, 30);
    await bankSays("PETR3", { quantity: 14, value: 560 });
    await settleQuantity(baseline.userId, "PETR3");

    // A day later, at a new bank price, with the same 6 units over.
    today = "2026-09-18";
    await bankSays("PETR3", { quantity: 14, value: 588 });
    expect(await settleQuantity(baseline.userId, "PETR3")).toBe(false);

    const plug = (await ledgerRows("PETR3")).find((row) => row.sourceHash);
    expect(plug).toMatchObject({
      transactionDate: "2026-09-17",
      totalAmount: 240,
    });
  });

  it("keeps small remainders rather than let them add up past the tolerance", async () => {
    await buy("PETR3", 20, 30);
    await bankSays("PETR3", { quantity: 14, value: 560 });
    await settleQuantity(baseline.userId, "PETR3");
    today = "2026-09-18";
    await bankSays("PETR3", { quantity: 12, value: 504 });
    await settleQuantity(baseline.userId, "PETR3");

    // A real sale of 5.99 arrives and the bank settles at 13.99.
    await db.insert(investmentTransactions).values({
      investmentAccountId: baseline.investmentAccountId,
      assetTypeId: baseline.assetTypeId,
      assetName: "PETR3",
      transactionType: "SELL",
      quantity: 5.99,
      pricePerUnit: 40,
      totalAmount: 239.6,
      transactionDate: "2026-09-17",
      isFixedIncome: false,
    });
    await bankSays("PETR3", { quantity: 13.99, value: 587.58 });
    await settleQuantity(baseline.userId, "PETR3");

    expect((await entryFor("PETR3")).holding?.quantity).toBeCloseTo(13.99, 9);
  });

  it("unwinds the newest sale when the surplus shrinks for another reason", async () => {
    await buy("PETR3", 20, 30);
    await bankSays("PETR3", { quantity: 14, value: 560 }); // R$40 each
    await settleQuantity(baseline.userId, "PETR3");
    // A buy typed in by hand before the bank shows it: 2 more over.
    today = "2026-09-18";
    await buy("PETR3", 2, 42, "2026-09-18");
    await bankSays("PETR3", { quantity: 14, value: 588 }); // R$42 each
    await settleQuantity(baseline.userId, "PETR3");

    // The bank catches up with the buy.
    await bankSays("PETR3", { quantity: 16, value: 672 });
    await settleQuantity(baseline.userId, "PETR3");

    const sales = (await ledgerRows("PETR3"))
      .filter((row) => row.sourceHash)
      .map((row) => [row.transactionDate, row.quantity, row.totalAmount]);
    expect(sales).toEqual([["2026-09-17", 6, 240]]);
  });

  it("books a growing surplus day by day, and replaces the oldest as real sales arrive", async () => {
    await buy("PETR3", 20, 30);
    await bankSays("PETR3", { quantity: 14, value: 560 }); // R$40 each
    await settleQuantity(baseline.userId, "PETR3");

    today = "2026-09-18";
    await bankSays("PETR3", { quantity: 12, value: 504 }); // R$42 each
    await settleQuantity(baseline.userId, "PETR3");

    const sales = async () =>
      (await ledgerRows("PETR3"))
        .filter((row) => row.sourceHash)
        .map((row) => [row.transactionDate, row.quantity, row.totalAmount])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    expect(await sales()).toEqual([
      ["2026-09-17", 6, 240],
      ["2026-09-18", 2, 84],
    ]);

    // The real first sale arrives: it is the oldest plug that goes, and the
    // later one stands as booked.
    await db.insert(investmentTransactions).values({
      investmentAccountId: baseline.investmentAccountId,
      assetTypeId: baseline.assetTypeId,
      assetName: "PETR3",
      transactionType: "SELL",
      quantity: 6,
      pricePerUnit: 40,
      totalAmount: 240,
      transactionDate: "2026-09-17",
      isFixedIncome: false,
    });
    await settleQuantity(baseline.userId, "PETR3");
    expect(await sales()).toEqual([["2026-09-18", 2, 84]]);
  });

  it("never books an asset the ledger has no trade of", async () => {
    // The bank's code may name a holding the ledger keeps under another name
    // (a B3 report's product name): booking it would hold it twice.
    await bankSays("CDBA251SW5G", {
      quantity: 3,
      value: 3519.71,
      profit: 519.71,
    });

    expect(await settleQuantity(baseline.userId, "CDBA251SW5G")).toBe(false);
    expect(await ledgerRows("CDBA251SW5G")).toEqual([]);
  });

  it("does not re-price a buy at each day's value when the bank gives no cost", async () => {
    await buy("PETR3", 6, 30);
    await bankSays("PETR3", { quantity: 14, value: 560 });
    await settleQuantity(baseline.userId, "PETR3");

    await bankSays("PETR3", { quantity: 14, value: 588 });
    expect(await settleQuantity(baseline.userId, "PETR3")).toBe(false);

    const plug = (await ledgerRows("PETR3")).find((row) => row.sourceHash);
    expect(plug?.totalAmount).toBe(320); // 8 × R$40, as first booked
  });

  it("takes back plugs left on an asset with no trade of its own", async () => {
    await bankSays("CDBA251SW5G", {
      quantity: 3,
      value: 3519.71,
      profit: 519.71,
    });
    await db.insert(investmentTransactions).values({
      investmentAccountId: baseline.investmentAccountId,
      assetTypeId: baseline.assetTypeId,
      assetName: "CDBA251SW5G",
      transactionType: "BUY",
      quantity: 3,
      pricePerUnit: 1000,
      totalAmount: 3000,
      transactionDate: "2026-09-15",
      isFixedIncome: false,
      sourceHash: `${baseline.userId}:reconcile:CDBA251SW5G`,
    });

    expect(await settleQuantity(baseline.userId, "CDBA251SW5G")).toBe(true);
    expect(await ledgerRows("CDBA251SW5G")).toEqual([]);
  });

  it("changes nothing the second time", async () => {
    await buy("PETR3", 6, 30);
    await bankSays("PETR3", { quantity: 14, value: 560 });
    await settleQuantity(baseline.userId, "PETR3");
    const before = await ledgerRows("PETR3");

    expect(await settleQuantity(baseline.userId, "PETR3")).toBe(false);
    expect(await ledgerRows("PETR3")).toEqual(before);
  });

  it("takes its adjustment back once the ledger catches up", async () => {
    // The bank shows the new position before its movement arrives: a plug
    // fills in, and when the real buy lands the plug goes rather than
    // doubling the position or leaving a sell behind.
    await buy("PETR3", 6, 30, "2026-03-10");
    await bankSays("PETR3", { quantity: 14, value: 560 });
    await settleQuantity(baseline.userId, "PETR3");

    await buy("PETR3", 8, 35, "2026-09-16");
    expect(await settleQuantity(baseline.userId, "PETR3")).toBe(true);

    const rows = await ledgerRows("PETR3");
    expect(rows.every((row) => row.sourceHash === null)).toBe(true);
    expect((await entryFor("PETR3")).holding?.quantity).toBe(14);
  });

  it("re-sizes its adjustment when the bank lags a buy typed in by hand", async () => {
    await buy("PETR3", 14, 30);
    await bankSays("PETR3", { quantity: 14, value: 560 });
    await buy("PETR3", 2, 30); // not at the bank yet
    await settleQuantity(baseline.userId, "PETR3");
    expect(
      (await ledgerRows("PETR3")).filter((row) => row.sourceHash),
    ).toMatchObject([{ transactionType: "SELL", quantity: 2 }]);

    await bankSays("PETR3", { quantity: 16, value: 640 }); // now it is
    await settleQuantity(baseline.userId, "PETR3");

    expect((await ledgerRows("PETR3")).filter((row) => row.sourceHash)).toEqual(
      [],
    );
  });

  it("leaves an asset held in another account alone", async () => {
    await buy("PETR3", 6, 30);
    const [other] = await db
      .insert(accounts)
      .values({
        userId: baseline.userId,
        name: "Outra corretora",
        accountType: "INVESTMENT",
        balance: 0,
      })
      .returning();
    await db.insert(investmentTransactions).values({
      investmentAccountId: other!.id,
      assetTypeId: baseline.assetTypeId,
      assetName: "PETR3",
      transactionType: "BUY",
      quantity: 2,
      pricePerUnit: 30,
      totalAmount: 60,
      transactionDate: "2026-03-10",
      isFixedIncome: false,
    });
    await bankSays("PETR3", { quantity: 14, value: 560 });

    await expect(
      settleQuantity(baseline.userId, "PETR3"),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(await ledgerRows("PETR3")).toHaveLength(2);
  });

  it("does not let another owner settle this owner's asset", async () => {
    await buy("PETR3", 6, 30);
    await bankSays("PETR3", { quantity: 14, value: 560 });

    await expect(settleQuantity("someone-else", "PETR3")).rejects.toMatchObject(
      { code: "NOT_FOUND" },
    );
    expect(await ledgerRows("PETR3")).toHaveLength(1);
  });
});

/** The plan the background sync builds: each asset at its stored figure. */
async function planFor(assets: string[]) {
  const facts = await db.select().from(providerHoldings);
  return new Map(
    assets.map((asset) => [
      asset,
      bankPosition(facts.find((fact) => fact.assetName === asset)!)!,
    ]),
  );
}

describe("reconcileWithBank", () => {
  it("leaves every bank-held holding agreeing with the bank", async () => {
    await buy("PETR3", 6, 30, "2026-03-10");
    await bankSays("PETR3", { quantity: 14, value: 560, profit: 140 });
    await buy("VALE3", 10, 50);
    await bankSays("VALE3", { quantity: 10, value: 600, profit: 50 });

    const result = await reconcileWithBank(
      baseline.userId,
      await planFor(["PETR3", "VALE3"]),
    );

    expect(result.failed).toBe(0);
    const { reconciliation } = await entryFor("PETR3");
    expect(reconciliation.mismatches).toEqual([]);
    expect(reconciliation.appTotal).toBeCloseTo(
      reconciliation.providerTotal,
      6,
    );
    for (const entry of reconciliation.entries) {
      expect(entry.appQuantity).toBeCloseTo(entry.providerQuantity!, 9);
      expect(entry.appGain).toBeCloseTo(entry.providerGain!, 6);
    }
  });

  it("books nothing for an asset outside the plan", async () => {
    await buy("PETR3", 6, 30);
    await bankSays("PETR3", { quantity: 14, value: 560 });

    expect(await reconcileWithBank(baseline.userId, new Map())).toEqual({
      settled: 0,
      failed: 0,
    });
    expect(await ledgerRows("PETR3")).toHaveLength(1);
  });

  it("closes a position the bank no longer holds, at no invented gain", async () => {
    await buy("PETR3", 10, 30);
    await reconcileWithBank(
      baseline.userId,
      new Map([
        [
          "PETR3",
          { quantity: 0, unitPrice: null, unitCost: null, syncedAt: SYNCED_AT },
        ],
      ]),
    );

    const plug = (await ledgerRows("PETR3")).find((row) => row.sourceHash);
    expect(plug).toMatchObject({
      transactionType: "SELL",
      quantity: 10,
      totalAmount: 300,
    });
    expect((await entryFor("PETR3")).holding).toBeUndefined();
  });

  it("drops the plug of an asset no single bank vouches for", async () => {
    await buy("PETR3", 6, 30);
    await bankSays("PETR3", { quantity: 14, value: 560 });
    await settleQuantity(baseline.userId, "PETR3");

    await reconcileWithBank(baseline.userId, new Map([["PETR3", null]]));

    expect(await ledgerRows("PETR3")).toHaveLength(1);
  });
});
