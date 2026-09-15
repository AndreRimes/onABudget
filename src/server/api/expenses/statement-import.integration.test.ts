import { inArray } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { seedBaseline, type TestDb } from "~/test/db";

// One in-memory database per test file, standing in for the singleton every
// module under test imports.
vi.mock("~/server/db", async () => {
  const { createTestDb } = await import("~/test/db");
  return { db: await createTestDb() };
});

const { db } = (await import("~/server/db")) as unknown as { db: TestDb };
const { expenseCategories, expenses } = await import("~/server/db/schema");
const { importStatementRows, previewStatementRows } =
  await import("./statement-import");
type StatementRow = Parameters<typeof previewStatementRows>[1][number];

let baseline: Awaited<ReturnType<typeof seedBaseline>>;

beforeAll(async () => {
  baseline = await seedBaseline(db);
});

function row(overrides: Partial<StatementRow> = {}): StatementRow {
  return {
    kind: "debit",
    date: "2026-03-14",
    amount: 25.4,
    description: "PADARIA CENTRAL",
    fitId: null,
    acctId: null,
    providerCategory: null,
    ...overrides,
  };
}

async function importRows(
  rows: StatementRow[],
  overrides: Partial<Parameters<typeof importStatementRows>[0]> = {},
) {
  const preview = await previewStatementRows(baseline.userId, rows, "");
  const categoryByHash = Object.fromEntries(
    preview.rows
      .filter((entry) => entry.status === "new" && entry.hash)
      .map((entry) => [entry.hash!, baseline.categoryId]),
  );

  return await importStatementRows({
    userId: baseline.userId,
    accountId: baseline.checkingAccountId,
    categoryByHash,
    pluggyCategoryHashes: [],
    ignoredHashes: [],
    rows,
    ...overrides,
  });
}

describe("importStatementRows", () => {
  it("writes a batch of rows and reports them as inserted", async () => {
    const rows = [
      row({ description: "PADARIA CENTRAL", amount: 10 }),
      row({ description: "MERCADO BOM", amount: 20 }),
      row({ description: "POSTO IPIRANGA", amount: 30 }),
    ];

    const result = await importRows(rows);

    expect(result).toEqual({ inserted: 3, skipped: 0 });
    const written = await db.select().from(expenses);
    expect(written).toHaveLength(3);
    expect(written.map((entry) => entry.amount).sort((a, b) => a - b)).toEqual([
      10, 20, 30,
    ]);
  });

  it("is a no-op when the same statement is imported twice", async () => {
    // The whole point of the source hash: re-importing an overlapping window
    // must not double the ledger.
    const rows = [row({ description: "FARMACIA SP", amount: 41.5 })];

    const first = await importRows(rows);
    const second = await importRows(rows);

    expect(first).toEqual({ inserted: 1, skipped: 0 });
    expect(second).toEqual({ inserted: 0, skipped: 1 });
  });

  it("keeps two identical purchases on the same day", async () => {
    // Same merchant, same price, same day: two real expenses, and the
    // occurrence suffix is what stops the second being read as a duplicate.
    const rows = [
      row({ description: "CAFE DA ESQUINA", amount: 7 }),
      row({ description: "CAFE DA ESQUINA", amount: 7 }),
    ];

    const result = await importRows(rows);
    expect(result).toEqual({ inserted: 2, skipped: 0 });
  });

  it("counts correctly across a batch boundary", async () => {
    // The importer writes in chunks; a row's outcome must not depend on which
    // chunk it landed in. 250 rows crosses the 200-row chunk size.
    const rows = Array.from({ length: 250 }, (_, index) =>
      row({ description: `LOJA ${index}`, amount: 100 + index }),
    );

    const result = await importRows(rows);
    expect(result).toEqual({ inserted: 250, skipped: 0 });

    // And re-importing the same 250 skips every one of them.
    expect(await importRows(rows)).toEqual({ inserted: 0, skipped: 250 });
  });

  it("skips rows the user gave no category", async () => {
    const rows = [row({ description: "SEM CATEGORIA", amount: 99 })];
    const result = await importStatementRows({
      userId: baseline.userId,
      accountId: baseline.checkingAccountId,
      categoryByHash: {},
      pluggyCategoryHashes: [],
      ignoredHashes: [],
      rows,
    });

    expect(result).toEqual({ inserted: 0, skipped: 1 });
  });

  it("gives every category it creates a colour of its own", async () => {
    // One shared default made the categories an import created
    // indistinguishable: same badge, same slice of the donut.
    const rows = [
      row({
        description: "SUPER ALFA",
        amount: 41,
        providerCategory: "Supermercados",
      }),
      row({
        description: "POSTO BETA",
        amount: 42,
        providerCategory: "Combustíveis",
      }),
    ];
    const preview = await previewStatementRows(baseline.userId, rows, "");

    await importStatementRows({
      userId: baseline.userId,
      accountId: baseline.checkingAccountId,
      categoryByHash: {},
      pluggyCategoryHashes: preview.rows
        .map((entry) => entry.hash)
        .filter((hash): hash is string => !!hash),
      ignoredHashes: [],
      rows,
    });

    const created = await db
      .select()
      .from(expenseCategories)
      .where(
        inArray(expenseCategories.name, ["Supermercados", "Combustíveis"]),
      );

    expect(created).toHaveLength(2);
    const colors = created.map((category) => category.color);
    expect(new Set(colors).size).toBe(2);
    // And neither of them reuses the colour the seeded category already has.
    expect(colors).not.toContain("#F97316");
  });

  it("refuses an account that is not the caller's", async () => {
    await expect(
      importRows([row({ description: "OUTRO DONO" })], {
        userId: "someone-else",
      }),
    ).rejects.toThrow();
  });
});
