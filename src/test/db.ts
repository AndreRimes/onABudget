// A real, throwaway SQLite database built from the same migrations the
// deployment runs.
//
// The importers are the part of this codebase that most needs testing and
// least suits pure unit tests: what matters about them is the dedup
// constraint, the conflict handling and the batching — all of which live in
// SQLite, not in TypeScript. Mocking drizzle would test the mock.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import * as schema from "~/server/db/schema";

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

/**
 * A throwaway file, not `:memory:`. libsql gives every *connection* its own
 * database under `:memory:`, so the migration would land on one connection and
 * the queries under test on another — which shows up as tables that exist for
 * the test's own handle and are missing inside a transaction.
 */
export async function createTestDb(): Promise<TestDb> {
  const directory = mkdtempSync(join(tmpdir(), "onabudget-test-"));
  const file = join(directory, "test.db");
  const db = drizzle(createClient({ url: `file:${file}` }), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });

  // The suite is short-lived; clean up when the process ends rather than
  // making every test file remember to.
  process.on("exit", () => rmSync(directory, { recursive: true, force: true }));

  return db;
}

/** A user with one checking and one investment account, plus one category. */
export async function seedBaseline(db: TestDb) {
  const userId = "user-1";

  await db.insert(schema.user).values({
    id: userId,
    name: "Test",
    email: "test@example.com",
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
