// The B3 report and the Open Finance sync describe the same brokerage. What
// arrived through one must not be imported again through the other, even
// though neither knows the other's ids.
import { beforeAll, describe, expect, it, vi } from "vitest";

import { seedBaseline, type TestDb } from "~/test/db";

vi.mock("~/server/db", async () => {
  const { createTestDb } = await import("~/test/db");
  return { db: await createTestDb() };
});

const { db } = (await import("~/server/db")) as unknown as { db: TestDb };
const { dividends, investmentTransactions } =
  await import("~/server/db/schema");
const { importB3Rows, previewB3Rows } = await import("./b3-import");
const { importPluggyInvestmentRows, previewPluggyInvestmentRows } =
  await import("../bank/investment-import");

let baseline: Awaited<ReturnType<typeof seedBaseline>>;

beforeAll(async () => {
  baseline = await seedBaseline(db);
});

const INSTITUTION = "XP INVESTIMENTOS CCTVM S/A";

function b3Trade(overrides: Record<string, unknown> = {}) {
  return {
    kind: "trade" as const,
    date: "2026-01-16",
    ticker: "PRIO3",
    side: "BUY" as const,
    quantity: 47,
    price: 44.22,
    amount: 2078.34,
    institution: INSTITUTION,
    isFixedIncome: false,
    ...overrides,
  };
}

function b3Income(overrides: Record<string, unknown> = {}) {
  return {
    kind: "income" as const,
    date: "2026-09-01",
    ticker: "ITUB4",
    type: "JCP" as const,
    amount: 10.65,
    institution: INSTITUTION,
    ...overrides,
  };
}

function pluggyTrade(overrides: Record<string, unknown> = {}) {
  return {
    kind: "trade" as const,
    investmentId: "inv-prio3",
    movementId: "mov-prio3",
    assetName: "PRIO3",
    providerType: "EQUITY",
    providerSubtype: "STOCK",
    date: "2026-01-16",
    side: "BUY" as const,
    quantity: 47,
    price: 44.22,
    amount: 2078.34,
    isFixedIncome: false,
    ...overrides,
  };
}

function pluggyIncome(overrides: Record<string, unknown> = {}) {
  return {
    kind: "income" as const,
    investmentId: "inv-itub4",
    movementId: "div-itub4",
    assetName: "ITUB4",
    providerType: "EQUITY",
    providerSubtype: "STOCK",
    date: "2026-09-01",
    amount: 10.65,
    ...overrides,
  };
}

const importB3 = (rows: Parameters<typeof importB3Rows>[0]["rows"]) =>
  importB3Rows({
    userId: baseline.userId,
    accountByInstitution: { [INSTITUTION]: baseline.investmentAccountId },
    assetTypeByTicker: {
      PRIO3: baseline.assetTypeId,
      VALE3: baseline.assetTypeId,
    },
    rows,
  });

const importPluggy = (
  rows: Parameters<typeof importPluggyInvestmentRows>[0]["rows"],
) =>
  importPluggyInvestmentRows({
    userId: baseline.userId,
    investmentAccountId: baseline.investmentAccountId,
    assetTypeByAsset: {
      PRIO3: baseline.assetTypeId,
      VALE3: baseline.assetTypeId,
    },
    pluggyTypeAssets: [],
    rows,
  });

describe("a trade already synced from Pluggy", () => {
  beforeAll(async () => {
    await importPluggy([pluggyTrade(), pluggyIncome()]);
  });

  it("is a duplicate in the B3 preview", async () => {
    const preview = await previewB3Rows(baseline.userId, [
      b3Trade(),
      b3Trade({ ticker: "VALE3", quantity: 11, amount: 869.22, price: 79.02 }),
    ]);

    expect(preview.rows.map((entry) => entry.status)).toEqual([
      "duplicate",
      "new",
    ]);
    // And the reason is visible: this file was never imported, the movement
    // simply already exists.
    expect(preview.rows[0]!.importedElsewhere).toBe(true);
    expect(preview.rows[1]!.importedElsewhere).toBe(false);
  });

  it("is not written again by the B3 import", async () => {
    const before = await db.select().from(investmentTransactions);

    const result = await importB3([b3Trade()]);

    expect(result).toEqual({ inserted: 0, skipped: 1 });
    expect(await db.select().from(investmentTransactions)).toHaveLength(
      before.length,
    );
  });

  it("covers income too, whatever the payment is called", async () => {
    // B3 says JCP, Pluggy says INTEREST: same asset, same day, same amount.
    const preview = await previewB3Rows(baseline.userId, [b3Income()]);
    expect(preview.rows[0]!.status).toBe("duplicate");

    const before = await db.select().from(dividends);
    expect(await importB3([b3Income()])).toEqual({ inserted: 0, skipped: 1 });
    expect(await db.select().from(dividends)).toHaveLength(before.length);
  });
});

describe("a trade already imported from a B3 report", () => {
  beforeAll(async () => {
    await importB3([
      b3Trade({ ticker: "VALE3", quantity: 11, amount: 869.22, price: 79.02 }),
    ]);
  });

  it("is a duplicate on the next Pluggy sync", async () => {
    const rows = [
      pluggyTrade({
        investmentId: "inv-vale3",
        movementId: "mov-vale3",
        assetName: "VALE3",
        quantity: 11,
        price: 79.02,
        amount: 869.22,
      }),
    ];

    const preview = await previewPluggyInvestmentRows(baseline.userId, rows);
    expect(preview[0]!.status).toBe("duplicate");
    expect(preview[0]!.importedElsewhere).toBe(true);

    const before = await db.select().from(investmentTransactions);
    expect(await importPluggy(rows)).toEqual({ inserted: 0, skipped: 1 });
    expect(await db.select().from(investmentTransactions)).toHaveLength(
      before.length,
    );
  });
});

describe("movements of the same source", () => {
  it("are still two movements when they look alike", async () => {
    // Two fills of one order: same asset, same day, same price. The provider
    // gives them different ids, and content dedup must not merge them.
    const first = pluggyTrade({
      investmentId: "inv-twin",
      movementId: "mov-twin-1",
      assetName: "VALE3",
      quantity: 5,
      price: 80,
      amount: 400,
    });
    const second = { ...first, movementId: "mov-twin-2" };

    expect(await importPluggy([first])).toEqual({ inserted: 1, skipped: 0 });
    expect(await importPluggy([second])).toEqual({ inserted: 1, skipped: 0 });
  });
});
