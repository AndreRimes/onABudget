// Two users, same data. Nothing one of them does may be visible to, or blocked
// by, the other: dedup hashes are private per owner, and every write that
// takes an id from the client is scoped to the caller.
import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { seedBaseline, type TestDb } from "~/test/db";

vi.mock("~/server/db", async () => {
  const { createTestDb } = await import("~/test/db");
  return { db: await createTestDb() };
});

const { db } = (await import("~/server/db")) as unknown as { db: TestDb };
const schema = await import("~/server/db/schema");
const { importB3Rows, previewB3Rows } = await import("./investments/b3-import");
const { importStatementRows, previewStatementRows } =
  await import("./expenses/statement-import");
const { budgetRepository } = await import("./budget/repository");
const { categoryRepository } = await import("./category/repository");
const { assetTypeRepository } = await import("./asset-type/repository");

let alice: Awaited<ReturnType<typeof seedBaseline>>;
let bob: typeof alice;

/** A second owner with the same shape of accounts as `seedBaseline`. */
async function seedSecondUser() {
  const userId = "user-2";
  await db.insert(schema.user).values({
    id: userId,
    name: "Bob",
    email: "bob@example.com",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const [checking] = await db
    .insert(schema.accounts)
    .values({ userId, name: "Conta", accountType: "CHECKING", balance: 0 })
    .returning();
  const [investment] = await db
    .insert(schema.accounts)
    .values({
      userId,
      name: "Corretora",
      accountType: "INVESTMENT",
      balance: 0,
    })
    .returning();
  const [category] = await db
    .insert(schema.expenseCategories)
    .values({ userId, name: "Alimentação", color: "#F97316" })
    .returning();
  const [assetType] = await db
    .insert(schema.assetTypes)
    .values({ userId, name: "Ações" })
    .returning();
  return {
    userId,
    checkingAccountId: checking!.id,
    investmentAccountId: investment!.id,
    categoryId: category!.id,
    assetTypeId: assetType!.id,
  };
}

beforeAll(async () => {
  alice = await seedBaseline(db);
  bob = await seedSecondUser();
});

const INSTITUTION = "XP INVESTIMENTOS CCTVM S/A";

const trade = {
  kind: "trade" as const,
  date: "2026-03-02",
  ticker: "BOVA11",
  side: "BUY" as const,
  quantity: 10,
  price: 125,
  amount: 1250,
  institution: INSTITUTION,
  isFixedIncome: false,
};

const statementRow = {
  kind: "debit" as const,
  date: "2026-03-05",
  amount: 45.9,
  description: "IFOOD",
};

describe("import dedup is private to each owner", () => {
  it("lets two users import the same B3 trade", async () => {
    const importFor = (owner: typeof alice) =>
      importB3Rows({
        userId: owner.userId,
        accountByInstitution: { [INSTITUTION]: owner.investmentAccountId },
        assetTypeByTicker: { BOVA11: owner.assetTypeId },
        rows: [trade],
      });

    expect(await importFor(alice)).toEqual({ inserted: 1, skipped: 0 });

    // Before hashes carried the owner, this was "duplicate" and the row was
    // silently dropped — Bob's real purchase never reached his ledger.
    const preview = await previewB3Rows(bob.userId, [trade]);
    expect(preview.rows[0]!.status).toBe("new");
    expect(await importFor(bob)).toEqual({ inserted: 1, skipped: 0 });

    // Each still dedups against their own earlier import.
    expect(await importFor(alice)).toEqual({ inserted: 0, skipped: 1 });

    const rows = await db
      .select()
      .from(schema.investmentTransactions)
      .where(eq(schema.investmentTransactions.assetName, "BOVA11"));
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.sourceHash)).toEqual([
      `${alice.userId}:trade|2026-03-02|BOVA11|10|1250.00`,
      `${bob.userId}:trade|2026-03-02|BOVA11|10|1250.00`,
    ]);
  });

  it("lets two users import the same statement line", async () => {
    const importFor = async (owner: typeof alice) => {
      const preview = await previewStatementRows(
        owner.userId,
        [statementRow],
        "",
      );
      const hash = preview.rows[0]!.hash!;
      expect(hash.startsWith(`${owner.userId}:stmt:`)).toBe(true);
      return {
        status: preview.rows[0]!.status,
        result: await importStatementRows({
          userId: owner.userId,
          accountId: owner.checkingAccountId,
          categoryByHash: { [hash]: owner.categoryId },
          pluggyCategoryHashes: [],
          ignoredHashes: [],
          rows: [statementRow],
        }),
      };
    };

    expect(await importFor(alice)).toEqual({
      status: "new",
      result: { inserted: 1, skipped: 0 },
    });
    // Same line, other owner: still new, still written.
    expect(await importFor(bob)).toEqual({
      status: "new",
      result: { inserted: 1, skipped: 0 },
    });
    // And a re-import is still caught for its own owner.
    expect(await importFor(alice)).toEqual({
      status: "duplicate",
      result: { inserted: 0, skipped: 1 },
    });
  });
});

describe("migration 0022 rewrote legacy hashes", () => {
  it("prefixes pre-existing rows with their owner and leaves recurring alone", async () => {
    // Emulate rows written before the owner prefix existed, then run the
    // migration's statements against them.
    await db.insert(schema.expenses).values([
      {
        checkingAccountId: alice.checkingAccountId,
        categoryId: alice.categoryId,
        amount: 1,
        expenseDate: "2026-01-01",
        source: "IMPORT",
        sourceHash: "ofx:acct:legacy",
      },
      {
        checkingAccountId: alice.checkingAccountId,
        categoryId: alice.categoryId,
        amount: 1,
        expenseDate: "2026-01-01",
        source: "RECURRING",
        sourceHash: "recurring:1:2026-01",
      },
    ]);
    await db.run(sql`
      UPDATE expenses
      SET source_hash = (
        SELECT user_id FROM accounts WHERE accounts.id = expenses.checking_account_id
      ) || ':' || source_hash
      WHERE source_hash IS NOT NULL AND source_hash NOT LIKE 'recurring:%'
    `);

    const hashes = (
      await db
        .select({ sourceHash: schema.expenses.sourceHash })
        .from(schema.expenses)
    ).map((row) => row.sourceHash);
    expect(hashes).toContain(`${alice.userId}:ofx:acct:legacy`);
    expect(hashes).toContain("recurring:1:2026-01");
  });
});

describe("client-supplied ids are checked against the caller", () => {
  it("budget update/delete cannot reach another user's row", async () => {
    const [mine] = await db
      .insert(schema.budget)
      .values({ userId: alice.userId, amount: 100, startPeriod: "2026-01-01" })
      .returning();

    expect(
      await budgetRepository.update({
        id: mine!.id,
        userId: bob.userId,
        amount: 1,
      }),
    ).toBeUndefined();
    expect(await budgetRepository.delete(bob.userId, mine!.id)).toBeUndefined();

    const [still] = await db
      .select()
      .from(schema.budget)
      .where(eq(schema.budget.id, mine!.id));
    expect(still?.amount).toBe(100);
  });

  it("ownsAll rejects a foreign or missing category / asset type", async () => {
    expect(
      await categoryRepository.ownsAll(alice.userId, [alice.categoryId]),
    ).toBe(true);
    expect(
      await categoryRepository.ownsAll(alice.userId, [bob.categoryId]),
    ).toBe(false);
    expect(
      await categoryRepository.ownsAll(alice.userId, [
        alice.categoryId,
        999_999,
      ]),
    ).toBe(false);
    expect(await categoryRepository.ownsAll(alice.userId, [])).toBe(true);

    expect(
      await assetTypeRepository.ownsAll(alice.userId, [alice.assetTypeId]),
    ).toBe(true);
    expect(
      await assetTypeRepository.ownsAll(alice.userId, [bob.assetTypeId]),
    ).toBe(false);
  });
});
