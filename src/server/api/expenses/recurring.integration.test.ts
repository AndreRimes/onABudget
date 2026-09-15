// A fixed expense is posted once per month and never again — the recurring
// rule is the only place the app *creates* money movements on its own, so
// "exactly once" is what keeps the ledger honest. This runs on every visit to
// Conta Corrente, which is also why it has to be cheap when nothing is due.
import { beforeAll, describe, expect, it, vi } from "vitest";

import { seedBaseline, type TestDb } from "~/test/db";

vi.mock("~/server/db", async () => {
  const { createTestDb } = await import("~/test/db");
  return { db: await createTestDb() };
});

const { db } = (await import("~/server/db")) as unknown as { db: TestDb };
const { eq } = await import("drizzle-orm");
const { expenses, recurringExpenses } = await import("~/server/db/schema");
const { materializeRecurring } = await import("./recurring");

let baseline: Awaited<ReturnType<typeof seedBaseline>>;

/** A fixed "today", so the number of due months is known. */
const TODAY = new Date("2026-09-15T12:00:00Z");

beforeAll(async () => {
  baseline = await seedBaseline(db);
  await db.insert(recurringExpenses).values({
    userId: baseline.userId,
    checkingAccountId: baseline.checkingAccountId,
    categoryId: baseline.categoryId,
    description: "Aluguel",
    amount: 1500,
    dayOfMonth: 10,
    startMonth: "2026-06",
  });
});

async function posted() {
  return await db
    .select()
    .from(expenses)
    .where(eq(expenses.source, "RECURRING"));
}

describe("materializeRecurring", () => {
  it("posts one occurrence per month due, and nothing else", async () => {
    const result = await materializeRecurring(baseline.userId, TODAY);

    // June, July, August, September (the 10th is already past on the 15th).
    expect(result).toEqual({ created: 4 });
    const rows = await posted();
    expect(rows.map((row) => row.expenseDate).sort()).toEqual([
      "2026-06-10",
      "2026-07-10",
      "2026-08-10",
      "2026-09-10",
    ]);
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(6000);
  });

  it("creates nothing on the next visit", async () => {
    // Every visit to the page calls this. The second call must find the
    // months already posted and write nothing — and count nothing.
    expect(await materializeRecurring(baseline.userId, TODAY)).toEqual({
      created: 0,
    });
    expect(await posted()).toHaveLength(4);
  });

  it("posts only the new month when time moves on", async () => {
    const nextMonth = new Date("2026-10-11T12:00:00Z");

    expect(await materializeRecurring(baseline.userId, nextMonth)).toEqual({
      created: 1,
    });
    expect((await posted()).map((row) => row.expenseDate)).toContain(
      "2026-10-10",
    );
  });

  it("does not post a month whose day has not arrived", async () => {
    const early = new Date("2026-11-03T12:00:00Z");

    expect(await materializeRecurring(baseline.userId, early)).toEqual({
      created: 0,
    });
  });
});
