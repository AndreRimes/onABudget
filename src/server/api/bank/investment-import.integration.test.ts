import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { seedBaseline, type TestDb } from "~/test/db";
// Type-only, so it does not pull the real module in ahead of the mock.
import type { PluggyInvestmentRow } from "./investment-import";

vi.mock("~/server/db", async () => {
  const { createTestDb } = await import("~/test/db");
  return { db: await createTestDb() };
});

const { db } = (await import("~/server/db")) as unknown as { db: TestDb };
const { assetLabels, assetTypes, dividends, investmentTransactions } =
  await import("~/server/db/schema");
const {
  importPluggyInvestmentRows,
  previewPluggyInvestmentRows,
  recordProviderAssetFacts,
} = await import("./investment-import");

let baseline: Awaited<ReturnType<typeof seedBaseline>>;

beforeAll(async () => {
  baseline = await seedBaseline(db);
});

function tradeRow(
  overrides: Partial<Extract<PluggyInvestmentRow, { kind: "trade" }>> = {},
): PluggyInvestmentRow {
  return {
    kind: "trade",
    investmentId: "inv-1",
    movementId: "mov-1",
    assetName: "PETR4",
    providerType: "EQUITY",
    providerSubtype: "STOCK",
    date: "2026-03-14",
    side: "BUY",
    quantity: 10,
    price: 38.5,
    amount: 385,
    isFixedIncome: false,
    ...overrides,
  };
}

function incomeRow(
  overrides: Partial<Extract<PluggyInvestmentRow, { kind: "income" }>> = {},
): PluggyInvestmentRow {
  return {
    kind: "income",
    investmentId: "inv-1",
    movementId: "div-1",
    assetName: "PETR4",
    providerType: "EQUITY",
    providerSubtype: "STOCK",
    date: "2026-03-20",
    amount: 12.5,
    ...overrides,
  };
}

function importRows(
  rows: PluggyInvestmentRow[],
  overrides: Partial<Parameters<typeof importPluggyInvestmentRows>[0]> = {},
) {
  return importPluggyInvestmentRows({
    userId: baseline.userId,
    investmentAccountId: baseline.investmentAccountId,
    assetTypeByAsset: {},
    pluggyTypeAssets: [],
    rows,
    ...overrides,
  });
}

describe("importPluggyInvestmentRows", () => {
  it("writes trades and income to their own tables", async () => {
    const result = await importRows([tradeRow(), incomeRow()], {
      assetTypeByAsset: { PETR4: baseline.assetTypeId },
    });

    expect(result).toEqual({ inserted: 2, skipped: 0 });
    expect(await db.select().from(investmentTransactions)).toHaveLength(1);
    const income = await db.select().from(dividends);
    expect(income).toHaveLength(1);
    expect(income[0]).toMatchObject({ source: "PLUGGY_IMPORT", amount: 12.5 });
  });

  it("is a no-op on a re-sync of the same movements", async () => {
    const rows = [
      tradeRow({ movementId: "mov-resync" }),
      incomeRow({ movementId: "div-resync" }),
    ];
    const options = { assetTypeByAsset: { PETR4: baseline.assetTypeId } };

    expect(await importRows(rows, options)).toEqual({
      inserted: 2,
      skipped: 0,
    });
    expect(await importRows(rows, options)).toEqual({
      inserted: 0,
      skipped: 2,
    });
  });

  it("skips a trade whose asset has no type anywhere", async () => {
    // Nothing to file it under, and guessing would write a wrong type into the
    // ledger that the allocation chart then reads back as fact.
    const result = await importRows([
      tradeRow({ assetName: "NOVO11", movementId: "mov-untyped" }),
    ]);

    expect(result).toEqual({ inserted: 0, skipped: 1 });
  });

  it("reuses the type an asset already carries in the ledger", async () => {
    // PETR4 was imported with a type in the first test; a later sync must not
    // need to be told again.
    const result = await importRows([tradeRow({ movementId: "mov-known" })]);
    expect(result).toEqual({ inserted: 1, skipped: 0 });
  });

  describe("asset types accepted from Pluggy", () => {
    it("creates the type Pluggy's classification implies", async () => {
      const result = await importRows(
        [
          tradeRow({
            assetName: "HGLG11",
            movementId: "mov-fii",
            providerType: "EQUITY",
            providerSubtype: "REAL_ESTATE_FUND",
          }),
        ],
        { pluggyTypeAssets: ["HGLG11"] },
      );

      expect(result).toEqual({ inserted: 1, skipped: 0 });
      const created = await db.select().from(assetTypes);
      expect(created.map((type) => type.name)).toContain("FIIs");
      // And it belongs to the importing user, not to everyone.
      expect(created.find((type) => type.name === "FIIs")?.userId).toBe(
        baseline.userId,
      );
    });

    it("matches an existing type instead of creating a near-duplicate", async () => {
      // The seeded type is "Ações"; Pluggy's label for STOCK is the same
      // string, so nothing new may appear.
      const before = await db.select().from(assetTypes);
      const result = await importRows(
        [tradeRow({ assetName: "VALE3", movementId: "mov-vale" })],
        { pluggyTypeAssets: ["VALE3"] },
      );

      expect(result).toEqual({ inserted: 1, skipped: 0 });
      expect(await db.select().from(assetTypes)).toHaveLength(before.length);
    });

    it("still skips an asset Pluggy could not classify", async () => {
      const result = await importRows(
        [
          tradeRow({
            assetName: "MISTERIO",
            movementId: "mov-other",
            providerType: "OTHER",
            providerSubtype: null,
          }),
        ],
        { pluggyTypeAssets: ["MISTERIO"] },
      );

      expect(result).toEqual({ inserted: 0, skipped: 1 });
    });
  });

  it("refuses an investment account that is not the caller's", async () => {
    await expect(
      importRows([tradeRow()], { userId: "someone-else" }),
    ).rejects.toThrow("Conta de investimento inválida");
  });
});

describe("previewPluggyInvestmentRows", () => {
  it("marks movements already imported as duplicates", async () => {
    const rows = [
      tradeRow({ movementId: "mov-preview" }),
      tradeRow({ movementId: "mov-preview-new" }),
    ];
    await importRows([rows[0]!], {
      assetTypeByAsset: { PETR4: baseline.assetTypeId },
    });

    const preview = await previewPluggyInvestmentRows(baseline.userId, rows);
    expect(preview.map((entry) => entry.status)).toEqual(["duplicate", "new"]);
  });

  it("suggests the local type matching Pluggy's classification", async () => {
    const preview = await previewPluggyInvestmentRows(baseline.userId, [
      tradeRow({ assetName: "BBAS3", movementId: "mov-suggest" }),
    ]);

    expect(preview[0]).toMatchObject({
      providerAssetType: "Ações",
      providerAssetTypeId: baseline.assetTypeId,
    });
  });
});

describe("recordProviderAssetFacts", () => {
  function fund(overrides: Record<string, unknown> = {}) {
    return {
      id: "inv-fund",
      itemId: "item-1",
      name: "ACE Capital Advisory FIF CIC Multi RL",
      code: "28.947.266/0001-65",
      currencyCode: "BRL",
      type: "MUTUAL_FUND",
      subtype: "MULTIMARKET",
      quantity: 461.92,
      value: 2.25,
      amount: 1039,
      balance: 1039,
      date: "2026-09-08",
      dueDate: null,
      rate: null,
      rateType: null,
      fixedAnnualRate: null,
      ...overrides,
    } as Parameters<typeof recordProviderAssetFacts>[1][number];
  }

  it("stores the readable name and the quota the provider reported", async () => {
    await recordProviderAssetFacts(baseline.userId, [fund()]);

    const [stored] = await db
      .select()
      .from(assetLabels)
      .where(eq(assetLabels.assetName, "28.947.266/0001-65"));
    expect(stored).toMatchObject({
      label: "ACE Capital Advisory FIF CIC Multi RL",
      providerQuota: 2.25,
      providerQuotaDate: "2026-09-08",
      source: "PLUGGY_IMPORT",
    });
  });

  it("updates the stored quota on a later sync", async () => {
    await recordProviderAssetFacts(baseline.userId, [fund({ value: 2.31 })]);

    const [stored] = await db
      .select()
      .from(assetLabels)
      .where(eq(assetLabels.assetName, "28.947.266/0001-65"));
    expect(stored?.providerQuota).toBe(2.31);
  });

  it("backfills the CNPJ onto holdings imported before it was collected", async () => {
    // The pricing key is what makes a fund quotable at all, and a holding
    // imported by an older version of the app has none — re-syncing has to be
    // enough to fix that, without re-importing anything.
    await db.insert(investmentTransactions).values({
      investmentAccountId: baseline.investmentAccountId,
      assetTypeId: baseline.assetTypeId,
      assetName: "26.978.199/0001-10",
      transactionType: "BUY",
      quantity: 5,
      pricePerUnit: 2.4,
      totalAmount: 12,
      transactionDate: "2026-05-29",
      sourceHash: "legacy-fund-row",
    });

    await recordProviderAssetFacts(baseline.userId, [
      fund({
        id: "inv-fund-2",
        name: "Kapitalo Kappa Advisory FIF em Cotas de FIM",
        code: "26.978.199/0001-10",
      }),
    ]);

    const [row] = await db
      .select()
      .from(investmentTransactions)
      .where(eq(investmentTransactions.sourceHash, "legacy-fund-row"));
    expect(row?.fundCnpj).toBe("26978199000110");
  });

  it("keeps no label for an asset whose name is already its key", async () => {
    await recordProviderAssetFacts(baseline.userId, [
      fund({ id: "inv-eq", name: "PETR4", code: "PETR4", type: "EQUITY" }),
    ]);

    const stored = await db
      .select()
      .from(assetLabels)
      .where(eq(assetLabels.assetName, "PETR4"));
    expect(stored).toHaveLength(0);
  });
});
