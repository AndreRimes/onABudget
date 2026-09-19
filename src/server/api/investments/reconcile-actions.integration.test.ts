// Settling a disagreement, end to end: a bank fact and a ledger go in, the
// owner's choice is applied, and the next snapshot reflects it — or, for a
// "keep", stops reporting it until the bank changes its story.
import { and, eq } from "drizzle-orm";
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
vi.mock("~/server/services/market-cache", () => ({
  todayIso: () => "2026-09-17",
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
const { investmentTransactions, providerHoldings, reconciliationDecisions } =
  await import("~/server/db/schema");
const { investmentRepository } = await import("./repository");
const { resolveReconciliation, undoReconciliationDecision } =
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
  await db.delete(reconciliationDecisions);
  /* eslint-enable drizzle/enforce-delete-with-where */
  quotes.clear();
});

function quote(price: number): QuoteResult {
  return {
    price,
    previousClose: price,
    status: "ok",
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
      syncedAt: SYNCED_AT,
    })
    .onConflictDoUpdate({
      target: [providerHoldings.userId, providerHoldings.assetName],
      set: {
        quantity: figures.quantity,
        value: figures.value,
        profit: figures.profit ?? null,
        applied: figures.applied ?? null,
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

describe("keeping the app's figure", () => {
  it("hides the mismatch while the bank keeps reporting the same numbers", async () => {
    await buy("PETR3", 6, 30);
    await bankSays("PETR3", { quantity: 14, value: 560, profit: 140 });
    expect((await entryFor("PETR3")).entry?.cause).toBe("quantity");

    const outcome = await resolveReconciliation({
      userId: baseline.userId,
      assetName: "PETR3",
      choice: "app",
    });
    expect(outcome).toEqual({ action: "kept" });

    const { entry, reconciliation } = await entryFor("PETR3");
    expect(entry?.cause).toBe("accepted");
    expect(reconciliation.mismatches).toHaveLength(0);
    expect(reconciliation.accepted.map((e) => e.assetName)).toEqual(["PETR3"]);
    // Still in the totals: accepting a difference does not make it vanish
    // from the sum, only from the list of things to look at.
    expect(reconciliation.providerTotal).toBe(560);
  });

  it("lapses when the bank reports different figures", async () => {
    await buy("PETR3", 6, 30);
    await bankSays("PETR3", { quantity: 14, value: 560, profit: 140 });
    await resolveReconciliation({
      userId: baseline.userId,
      assetName: "PETR3",
      choice: "app",
    });

    await bankSays("PETR3", { quantity: 15, value: 600, profit: 150 });

    const { entry } = await entryFor("PETR3");
    expect(entry?.cause).toBe("quantity");
  });

  it("can be undone", async () => {
    await buy("PETR3", 6, 30);
    await bankSays("PETR3", { quantity: 14, value: 560, profit: 140 });
    await resolveReconciliation({
      userId: baseline.userId,
      assetName: "PETR3",
      choice: "app",
    });

    await undoReconciliationDecision(baseline.userId, "PETR3");

    expect((await entryFor("PETR3")).entry?.cause).toBe("quantity");
  });

  it("refuses an asset with nothing to resolve", async () => {
    await buy("PETR3", 14, 30);
    quotes.set("PETR3", quote(40));
    await bankSays("PETR3", { quantity: 14, value: 560, profit: 140 });

    await expect(
      resolveReconciliation({
        userId: baseline.userId,
        assetName: "PETR3",
        choice: "app",
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});

describe("accepting the bank's quantity", () => {
  it("books the missing units as a buy costed from what the bank says was applied", async () => {
    // The ledger knows 6 of 14 shares. The bank says R$420 went into the
    // holding in total; the ledger accounts for R$180 of that, so the other
    // 8 shares cost R$240 — dated the day before the ledger's first trade.
    await buy("PETR3", 6, 30, "2026-03-10");
    await bankSays("PETR3", {
      quantity: 14,
      value: 560,
      profit: 140,
      applied: 420,
    });

    const outcome = await resolveReconciliation({
      userId: baseline.userId,
      assetName: "PETR3",
      choice: "bank",
    });

    expect(outcome).toMatchObject({
      action: "adjusted",
      side: "BUY",
      quantity: 8,
      totalAmount: 240,
      date: "2026-03-09",
    });
    const rows = await ledgerRows("PETR3");
    expect(rows).toHaveLength(2);
    const adjustment = rows.find((row) => row.sourceHash !== null)!;
    expect(adjustment).toMatchObject({
      investmentAccountId: baseline.investmentAccountId,
      assetTypeId: baseline.assetTypeId,
      transactionType: "BUY",
      quantity: 8,
      pricePerUnit: 30,
      totalAmount: 240,
    });
    expect(adjustment.sourceHash).toBe(
      `${baseline.userId}:reconcile:PETR3:${SYNCED_AT.getTime()}`,
    );

    const { holding } = await entryFor("PETR3");
    expect(holding?.quantity).toBe(14);
    expect(holding?.totalCost).toBeCloseTo(420, 6);
  });

  it("costs the missing units at the bank's unit price when no applied figure helps", async () => {
    await buy("PETR3", 6, 30);
    await bankSays("PETR3", { quantity: 14, value: 560, profit: null });

    const outcome = await resolveReconciliation({
      userId: baseline.userId,
      assetName: "PETR3",
      choice: "bank",
    });

    // 8 units at 560/14 = R$40 each.
    expect(outcome).toMatchObject({
      action: "adjusted",
      side: "BUY",
      quantity: 8,
      totalAmount: 320,
    });
  });

  it("books surplus units as a sell dated today", async () => {
    await buy("PETR3", 20, 30);
    await bankSays("PETR3", { quantity: 14, value: 560 });

    const outcome = await resolveReconciliation({
      userId: baseline.userId,
      assetName: "PETR3",
      choice: "bank",
    });

    expect(outcome).toMatchObject({
      action: "adjusted",
      side: "SELL",
      quantity: 6,
      totalAmount: 240,
      date: "2026-09-17",
    });
    expect((await entryFor("PETR3")).holding?.quantity).toBe(14);
  });

  it("needs a type and an account for an asset the ledger never saw", async () => {
    await bankSays("HGLG11", { quantity: 30, value: 4500 });

    await expect(
      resolveReconciliation({
        userId: baseline.userId,
        assetName: "HGLG11",
        choice: "bank",
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    const outcome = await resolveReconciliation({
      userId: baseline.userId,
      assetName: "HGLG11",
      choice: "bank",
      assetTypeId: baseline.assetTypeId,
      investmentAccountId: baseline.investmentAccountId,
    });

    // Nothing to date it against: the sync day is the only day known.
    expect(outcome).toMatchObject({
      action: "adjusted",
      side: "BUY",
      quantity: 30,
      totalAmount: 4500,
      date: "2026-09-15",
    });
    expect((await entryFor("HGLG11")).holding?.quantity).toBe(30);
  });

  it("does not book the same adjustment twice for one sync", async () => {
    await buy("PETR3", 6, 30);
    await bankSays("PETR3", { quantity: 14, value: 560 });
    await resolveReconciliation({
      userId: baseline.userId,
      assetName: "PETR3",
      choice: "bank",
    });
    // Open the gap again without a new sync: the retry must find its hash
    // taken and book nothing.
    await db
      .update(investmentTransactions)
      .set({ quantity: 2, totalAmount: 60 })
      .where(
        and(
          eq(investmentTransactions.assetName, "PETR3"),
          eq(investmentTransactions.quantity, 6),
        ),
      );
    expect((await entryFor("PETR3")).entry?.cause).toBe("quantity");

    await resolveReconciliation({
      userId: baseline.userId,
      assetName: "PETR3",
      choice: "bank",
    });

    expect(await ledgerRows("PETR3")).toHaveLength(2);
  });

  it("drops an earlier decision to keep the app's figure", async () => {
    await buy("PETR3", 6, 30);
    await bankSays("PETR3", { quantity: 14, value: 560 });
    await resolveReconciliation({
      userId: baseline.userId,
      assetName: "PETR3",
      choice: "app",
    });
    // A lapsed "keep" still sits in the table; a new bank figure exposes the
    // gap again and this time the owner accepts it.
    await bankSays("PETR3", { quantity: 15, value: 600 });

    await resolveReconciliation({
      userId: baseline.userId,
      assetName: "PETR3",
      choice: "bank",
    });

    expect(await db.select().from(reconciliationDecisions)).toHaveLength(0);
  });
});

describe("accepting the bank's price", () => {
  it("marks the holding at the bank's unit price until the bank changes it", async () => {
    await buy("PETR3", 14, 30);
    quotes.set("PETR3", quote(40)); // app: 560
    await bankSays("PETR3", { quantity: 14, value: 590, profit: 170 }); // 5% off
    expect((await entryFor("PETR3")).entry?.cause).toBe("price");

    const outcome = await resolveReconciliation({
      userId: baseline.userId,
      assetName: "PETR3",
      choice: "bank",
    });
    expect(outcome).toMatchObject({ action: "price_pinned" });
    expect((outcome as { price: number }).price).toBeCloseTo(590 / 14, 9);

    const { entry, holding } = await entryFor("PETR3");
    expect(holding?.currentValue).toBeCloseTo(590, 6);
    expect(holding?.priceStatus).toBe("provider");
    expect(entry?.cause).toBe("match");

    // The bank moves on; the quote is the price again.
    await bankSays("PETR3", { quantity: 14, value: 600, profit: 180 });
    const after = await entryFor("PETR3");
    expect(after.holding?.currentValue).toBeCloseTo(560, 6);
    expect(after.holding?.priceStatus).toBe("ok");
    expect(after.entry?.cause).toBe("price");
  });

  it("refuses accrual fixed income, which has no price to pin", async () => {
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
    await bankSays("CDB X", { quantity: 1, value: 1100 });
    expect((await entryFor("CDB X")).entry?.cause).toBe("price");

    await expect(
      resolveReconciliation({
        userId: baseline.userId,
        assetName: "CDB X",
        choice: "bank",
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});

describe("accepting the bank's gain", () => {
  it("rescales the buys so the cost basis is the bank's", async () => {
    // Same 14 shares, same R$560, but the bank says R$70 of gain to the
    // app's R$140: it has the shares costing R$490, not R$420.
    await buy("PETR3", 4, 30, "2026-03-10");
    await buy("PETR3", 10, 30, "2026-04-10");
    quotes.set("PETR3", quote(40));
    await bankSays("PETR3", { quantity: 14, value: 560, profit: 70 });
    expect((await entryFor("PETR3")).entry?.cause).toBe("gain");

    const outcome = await resolveReconciliation({
      userId: baseline.userId,
      assetName: "PETR3",
      choice: "bank",
    });

    expect(outcome).toMatchObject({ action: "cost_rescaled", targetCost: 490 });
    expect((outcome as { factor: number }).factor).toBeCloseTo(490 / 420, 9);
    const rows = await ledgerRows("PETR3");
    expect(rows.map((row) => row.totalAmount).sort((a, b) => a - b)).toEqual([
      140, 350,
    ]);
    expect(rows.every((row) => row.pricePerUnit === 35)).toBe(true);

    const { entry, holding } = await entryFor("PETR3");
    expect(holding?.totalCost).toBeCloseTo(490, 6);
    expect(holding?.unrealizedGain).toBeCloseTo(70, 6);
    expect(entry?.cause).toBe("match");
  });

  it("prefers the applied figure over value minus profit", async () => {
    await buy("PETR3", 14, 30);
    quotes.set("PETR3", quote(40));
    await bankSays("PETR3", {
      quantity: 14,
      value: 560,
      profit: 70,
      applied: 500,
    });

    const outcome = await resolveReconciliation({
      userId: baseline.userId,
      assetName: "PETR3",
      choice: "bank",
    });

    expect(outcome).toMatchObject({ action: "cost_rescaled", targetCost: 500 });
  });
});

describe("ownership", () => {
  it("does not let another owner resolve, or undo, this owner's finding", async () => {
    await buy("PETR3", 6, 30);
    await bankSays("PETR3", { quantity: 14, value: 560 });
    await resolveReconciliation({
      userId: baseline.userId,
      assetName: "PETR3",
      choice: "app",
    });

    await expect(
      resolveReconciliation({
        userId: "someone-else",
        assetName: "PETR3",
        choice: "bank",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await undoReconciliationDecision("someone-else", "PETR3");

    expect((await entryFor("PETR3")).entry?.cause).toBe("accepted");
    expect(await ledgerRows("PETR3")).toHaveLength(1);
  });
});
