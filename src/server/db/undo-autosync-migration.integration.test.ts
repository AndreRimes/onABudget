// Migration 0026 deletes production rows, so it is checked against the cases
// it must and must not touch before it ever runs there.
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";

import { createTestDb, seedBaseline, type TestDb } from "~/test/db";
import { dividends, investmentTransactions } from "~/server/db/schema";

let db: TestDb;
let baseline: Awaited<ReturnType<typeof seedBaseline>>;
const BEFORE = "2026-11-04 12:00:00";
const AFTER = "2026-11-04 18:30:00";

function trade(
  assetName: string,
  createdAt: string,
  sourceHash: string | null,
) {
  return {
    investmentAccountId: baseline.investmentAccountId,
    assetTypeId: baseline.assetTypeId,
    assetName,
    transactionType: "BUY" as const,
    quantity: 3,
    pricePerUnit: 1000,
    totalAmount: 3000,
    transactionDate: "2025-10-01",
    isFixedIncome: true,
    sourceHash,
    createdAt,
  };
}

beforeAll(async () => {
  db = await createTestDb();
  baseline = await seedBaseline(db);
  const u = baseline.userId;
  await db.insert(investmentTransactions).values([
    // Brought in by the background sync: an opening position and a plug.
    trade("CDBA251SW5G", AFTER, `${u}:pluggy:position:inv-cdb`),
    trade("CDB725DF40L", AFTER, `${u}:reconcile:CDB725DF40L`),
    // The owner's own copy under the B3 name, from before.
    trade("CDB - BANCO DIGIMAIS S/A", BEFORE, `${u}:b3:x`),
    // Synced in the dialog before the release, topped up after: kept.
    trade("PETR3", BEFORE, `${u}:pluggy:investment:inv-1:mv-1`),
    trade("PETR3", AFTER, `${u}:reconcile:PETR3`),
    // Typed by hand after the release: kept.
    trade("NOVO11", AFTER, null),
  ]);
  await db.insert(dividends).values([
    {
      investmentAccountId: baseline.investmentAccountId,
      assetName: "CDBA251SW5G",
      type: "RENDIMENTO",
      amount: 12,
      paymentDate: "2026-10-01",
      source: "PLUGGY_IMPORT",
      sourceHash: `${u}:pluggy:investment:inv-cdb:div`,
      createdAt: AFTER,
    },
    {
      investmentAccountId: baseline.investmentAccountId,
      assetName: "PETR3",
      type: "RENDIMENTO",
      amount: 5,
      paymentDate: "2026-10-01",
      source: "PLUGGY_IMPORT",
      sourceHash: `${u}:pluggy:investment:inv-1:div`,
      createdAt: AFTER,
    },
  ]);

  const statements = readFileSync(
    "drizzle/0026_undo_autosync_new_assets.sql",
    "utf8",
  ).split("--> statement-breakpoint");
  for (const statement of statements) await db.run(sql.raw(statement));
});

it("removes only the assets the background sync brought in on its own", async () => {
  const assets = (await db.select().from(investmentTransactions))
    .map((row) => row.assetName)
    .sort((a, b) => a.localeCompare(b));
  expect(assets).toEqual([
    "CDB - BANCO DIGIMAIS S/A",
    "NOVO11",
    "PETR3",
    "PETR3",
  ]);
  expect(
    (await db.select().from(dividends)).map((row) => row.assetName),
  ).toEqual(["PETR3"]);
});
