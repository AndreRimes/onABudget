// One holding, two names: what the bank reports by code must land on the asset
// the ledger already has, and copies from earlier syncs must be merged away.
import { gte } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { seedBaseline, type TestDb } from "~/test/db";
import { investment, movement } from "~/test/pluggy";

vi.mock("~/server/db", async () => {
  const { createTestDb } = await import("~/test/db");
  return { db: await createTestDb() };
});

const { db } = (await import("~/server/db")) as unknown as { db: TestDb };
const { dividends, investmentTransactions } =
  await import("~/server/db/schema");
const { identifyHoldings } = await import("./ledger-identity");
const { normalizeInvestmentMovements, normalizeOpeningPosition } =
  await import("./investment-import");
const { importB3Rows } = await import("../investments/b3-import");
const { investmentRepository } = await import("../investments/repository");

const base = await seedBaseline(db);

beforeEach(async () => {
  await db
    .delete(investmentTransactions)
    .where(gte(investmentTransactions.id, 0));
  await db.delete(dividends).where(gte(dividends.id, 0));
});

type Row = typeof investmentTransactions.$inferInsert;
async function book(overrides: Partial<Row>) {
  await db.insert(investmentTransactions).values({
    investmentAccountId: base.investmentAccountId,
    assetTypeId: base.assetTypeId,
    assetName: "X",
    transactionType: "BUY",
    quantity: 2,
    pricePerUnit: 1000,
    totalAmount: 2000,
    transactionDate: "2025-10-07",
    isFixedIncome: true,
    ...overrides,
    sourceHash: overrides.sourceHash
      ? `${base.userId}:${overrides.sourceHash}`
      : null,
  });
}

const ledger = async () =>
  (await db.select().from(investmentTransactions)).map((row) => [
    row.assetName,
    row.transactionType,
    row.quantity,
    row.totalAmount,
  ]);

function cdb(code: string, overrides = {}, movements = {}) {
  return {
    investment: investment({
      id: `inv-${code}`,
      code,
      name: "CDB - BANCO S.A.",
      type: "FIXED_INCOME",
      subtype: "CDB",
      quantity: 2,
      value: 1133,
      balance: 2266,
      dueDate: "2031-10-07",
      ...overrides,
    }),
    movements: [
      movement({
        id: `mov-${code}`,
        type: "BUY",
        quantity: 2,
        value: 1000,
        amount: 2000,
        date: "2025-10-07",
        tradeDate: "2025-10-07",
        ...movements,
      }),
    ],
  };
}

const b3 = (code: string) => `trade|2025-10-07|${code}|2|2000.00`;
const run = async (batches: ReturnType<typeof cdb>[]) => {
  const result = await identifyHoldings(base.userId, batches);
  return {
    names: result.batches.map((batch) => batch.investment.code),
    left: result.batches.flatMap((batch) =>
      normalizeInvestmentMovements(
        batch.investment,
        batch.movements,
      ).rows.filter((row) => !result.alreadyHeld(row)),
    ),
  };
};

describe("a B3 holding the owner renamed", () => {
  it("is the asset the code names, and the synced copy is merged away", async () => {
    await book({ assetName: "Andbank", sourceHash: b3("CDBA") });
    await book({
      assetName: "CDBA",
      sourceHash: "pluggy:investment:inv-CDBA:mov-CDBA",
    });
    await book({
      assetName: "CDBA",
      quantity: 1,
      totalAmount: 1100,
      transactionDate: "2026-05-10",
      sourceHash: "pluggy:investment:inv-CDBA:mov-later",
    });
    await book({
      assetName: "CDBA",
      sourceHash: "pluggy:position:inv-CDBA:shortfall",
    });
    await book({ assetName: "CDBA", sourceHash: "reconcile:CDBA" });
    for (const [assetName, source, sourceHash] of [
      ["Andbank", "B3_IMPORT", "a"],
      ["CDBA", "PLUGGY_IMPORT", "b"],
    ] as const)
      await db.insert(dividends).values({
        investmentAccountId: base.investmentAccountId,
        assetName,
        type: "RENDIMENTO",
        amount: 10,
        paymentDate: "2026-01-02",
        source,
        sourceHash,
      });

    const expected = [
      ["Andbank", "BUY", 2, 2000],
      // Nothing the ledger lacked is lost: the later buy moves over.
      ["Andbank", "BUY", 1, 1100],
    ];
    for (let sync = 0; sync < 2; sync++) {
      expect(await run([cdb("CDBA")])).toEqual({
        names: ["Andbank"],
        left: [],
      });
      expect(await ledger()).toEqual(expected);
      expect(await db.select().from(dividends)).toHaveLength(1);
    }
  });

  it("is left alone when two codes were renamed into one asset", async () => {
    await book({ assetName: "CDBs", sourceHash: b3("CDBA") });
    await book({ assetName: "CDBs", sourceHash: b3("CDBB") });
    expect((await run([cdb("CDBA")])).names).toEqual(["CDBA"]);
  });

  it("keeps its name when B3 reports it again", async () => {
    await book({ assetName: "Andbank", sourceHash: b3("CDBA") });
    await importB3Rows({
      userId: base.userId,
      accountByInstitution: { XP: base.investmentAccountId },
      assetTypeByTicker: {},
      rows: [
        {
          kind: "trade",
          date: "2026-06-01",
          ticker: "CDBA",
          side: "SELL",
          quantity: 1,
          price: 1100,
          amount: 1100,
          institution: "XP",
          isFixedIncome: true,
        },
      ],
    });
    expect((await ledger()).map(([name]) => name)).toEqual([
      "Andbank",
      "Andbank",
    ]);
  });
});

describe("a CDB typed by hand", () => {
  const typed = {
    assetName: "PICPAY 2029",
    quantity: 1,
    pricePerUnit: 2000,
    fixedIncomeYieldType: "CDI_PERCENTAGE" as const,
    fixedIncomeRate: 104.75,
  };
  const terms = { rateType: "CDI", rate: 104.75 };

  it("takes the bank's id and unit count, for good", async () => {
    await book(typed);
    await book({
      assetName: "CDBP",
      sourceHash: "pluggy:investment:inv-CDBP:mov-CDBP",
    });
    await run([cdb("CDBP", terms)]);
    expect(await ledger()).toEqual([["PICPAY 2029", "BUY", 2, 2000]]);

    // Out of the bank's window: no movement left to recognise it by.
    const later = cdb("CDBP", {
      ...terms,
      issueDate: "2025-10-01",
      amountOriginal: 1990,
    });
    const result = await identifyHoldings(base.userId, [
      { ...later, movements: [] },
    ]);
    const [batch] = result.batches;
    expect(batch!.investment.code).toBe("PICPAY 2029");
    expect(
      result.alreadyHeld(normalizeOpeningPosition(batch!.investment)!),
    ).toBe(true);
  });

  it("is not guessed at another rate, or between two candidates", async () => {
    await book(typed);
    expect((await run([cdb("CDBP", { ...terms, rate: 110 })])).names).toEqual([
      "CDBP",
    ]);
    const two = [cdb("CDBP", terms), cdb("CDBQ", terms)];
    expect((await run(two)).names).toEqual(["CDBP", "CDBQ"]);
    expect(await ledger()).toEqual([["PICPAY 2029", "BUY", 1, 2000]]);
  });

  it("stays apart when only some of its buys are the bank's", async () => {
    await book(typed);
    await book({ ...typed, transactionDate: "2024-01-10" });
    expect((await run([cdb("CDBP", terms)])).names).toEqual(["CDBP"]);
  });
});

it("recognises a Tesouro title behind its ISIN, a cent and a day off", async () => {
  await book({
    assetName: "TESOURO IPCA+ 2050",
    tesouroTitle: "TESOURO IPCA+ 2050",
    totalAmount: 1999.99,
    transactionDate: "2025-10-08",
    sourceHash: "trade|2025-10-08|TESOURO IPCA+ 2050|2|1999.99",
  });
  // The provider reports the holding twice, once without a code.
  const coded = cdb("BRSTN", { name: "NTNB PRINC", dueDate: "2050-08-15" });
  const twin = cdb("", {
    id: "inv-twin",
    code: null,
    name: "NTNB PRINC",
    dueDate: "2050-08-15",
  });
  await book({
    assetName: "BRSTN",
    sourceHash: "pluggy:investment:inv-BRSTN:mov-BRSTN",
  });
  await book({
    assetName: "NTNB PRINC",
    sourceHash: "pluggy:investment:inv-twin:mov-",
  });
  expect(await run([coded, twin])).toEqual({
    names: ["TESOURO IPCA+ 2050"],
    left: [],
  });
  expect(await ledger()).toEqual([["TESOURO IPCA+ 2050", "BUY", 2, 1999.99]]);
});

it("brings in a holding the ledger has never seen, under its code", async () => {
  await book({ assetName: "Andbank", sourceHash: b3("CDBA") });
  const result = await run([cdb("CDBNEW")]);
  expect(result.names).toEqual(["CDBNEW"]);
  expect(result.left).toHaveLength(1);
});

it("drops the plugs of a renamed asset, which are keyed by its old name", async () => {
  await book({ assetName: "CDBA", sourceHash: b3("CDBA") });
  await book({ assetName: "CDBA", sourceHash: "reconcile:CDBA" });
  await book({ assetName: "CDBA", sourceHash: "reconcile:CDBA@2026-01-01" });
  await investmentRepository.renameByAssetName(base.userId, "CDBA", "Andbank");
  expect(await ledger()).toEqual([["Andbank", "BUY", 2, 2000]]);
});
