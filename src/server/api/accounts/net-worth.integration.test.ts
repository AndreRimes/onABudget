import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { seedBaseline, type TestDb } from "~/test/db";

vi.mock("~/server/db", async () => {
  const { createTestDb } = await import("~/test/db");
  return { db: await createTestDb() };
});

const { db } = (await import("~/server/db")) as unknown as { db: TestDb };
const { accountBalanceSnapshots, accounts } =
  await import("~/server/db/schema");
const { getNetWorthSeries, recordBalanceSnapshots } =
  await import("./net-worth");

let baseline: Awaited<ReturnType<typeof seedBaseline>>;

beforeAll(async () => {
  baseline = await seedBaseline(db);
});

describe("recordBalanceSnapshots", () => {
  it("records checking accounts only", async () => {
    // An investment account's balance is not cash — the portfolio engine is
    // the authority on what those holdings are worth, and counting the account
    // balance too would double it. A credit card's is not cash either.
    const { recorded } = await recordBalanceSnapshots(
      baseline.userId,
      "2026-03-01",
    );

    expect(recorded).toBe(1);
    const rows = await db.select().from(accountBalanceSnapshots);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      accountId: baseline.checkingAccountId,
      date: "2026-03-01",
    });
  });

  it("keeps the first balance seen on a day", async () => {
    // A mid-day spending burst must not rewrite the day already on the chart.
    await db
      .update(accounts)
      .set({ balance: 999 })
      .where(eq(accounts.id, baseline.checkingAccountId));

    const { recorded } = await recordBalanceSnapshots(
      baseline.userId,
      "2026-03-01",
    );

    expect(recorded).toBe(0);
    const [row] = await db.select().from(accountBalanceSnapshots);
    expect(row?.balance).toBe(0);
  });

  it("records a new day separately", async () => {
    const { recorded } = await recordBalanceSnapshots(
      baseline.userId,
      "2026-03-02",
    );

    expect(recorded).toBe(1);
    expect(await db.select().from(accountBalanceSnapshots)).toHaveLength(2);
  });

  it("records nothing for a user with no checking accounts", async () => {
    expect(await recordBalanceSnapshots("someone-else")).toEqual({
      recorded: 0,
    });
  });
});

describe("getNetWorthSeries from a precomputed snapshot", () => {
  // The dashboard hands over the "max" replay it already needed for the cards.
  // A day's value does not depend on the range asked for, so the chart's window
  // has to come out as a plain slice of that series — no second replay.
  function point(date: string, value: number) {
    return {
      date,
      value,
      invested: value,
      gain: 0,
      benchmarkGains: {},
      dividendsAccumulated: 0,
    };
  }

  it("cuts the chart's window out of the full series", async () => {
    const today = new Date();
    const iso = (daysAgo: number) =>
      new Date(today.getTime() - daysAgo * 86_400_000)
        .toISOString()
        .slice(0, 10);
    const series = [
      point(iso(800), 100),
      point(iso(400), 200),
      point(iso(300), 300),
      point(iso(10), 400),
    ];

    const oneYear = await getNetWorthSeries(baseline.userId, "1y", { series });
    const everything = await getNetWorthSeries(baseline.userId, "max", {
      series,
    });

    expect(oneYear.points.map((entry) => entry.investments)).toEqual([
      300, 400,
    ]);
    expect(everything.points.map((entry) => entry.investments)).toEqual([
      100, 200, 300, 400,
    ]);
    // Same day, same figure, whichever window it was read through.
    expect(oneYear.points[1]).toEqual(everything.points[3]);
  });
});
