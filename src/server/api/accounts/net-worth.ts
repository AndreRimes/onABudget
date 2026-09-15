// Net worth over time: cash from daily balance snapshots, investments from the
// portfolio engine's own replay.
//
// The two halves have very different provenance and this module does not
// pretend otherwise. The investment side is *derived* — the engine can replay
// the whole ledger and produce a value for any past day. The cash side is
// *observed* — a balance is only known for days a snapshot was taken, so the
// series starts when snapshots started and carries the last known value
// forward between them.
import { and, eq, gte } from "drizzle-orm";

import { db } from "~/server/db";
import { accountBalanceSnapshots, accounts } from "~/server/db/schema";
import { investmentRepository } from "../investments/repository";
import {
  periodStartIso,
  type PortfolioSnapshot,
  type TimeRange,
} from "../investments/portfolio-engine";

/** Local calendar day, matching `todayIso` in the market cache. */
function todayIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Record today's balance for every checking account of a user.
 *
 * Idempotent by primary key, so it can be called from anywhere that already
 * knows balances are current — a Pluggy refresh, a manual edit, or simply the
 * first read of the day. Uses `onConflictDoNothing` rather than an upsert on
 * purpose: the first balance seen on a given day is the one kept, so a mid-day
 * spending burst cannot rewrite the day that is already on the chart.
 */
export async function recordBalanceSnapshots(
  userId: string,
  date = todayIso(),
) {
  const owned = await db
    .select({ id: accounts.id, balance: accounts.balance })
    .from(accounts)
    // CHECKING only, matching the "patrimônio" card on the dashboard. A credit
    // card's balance in this app is not cash the user holds — nothing keeps it
    // current (the Pluggy refresh deliberately skips cards, because there the
    // provider balance is the open invoice), so adding it would be adding a
    // stale number of the wrong sign.
    .where(
      and(eq(accounts.userId, userId), eq(accounts.accountType, "CHECKING")),
    );

  if (owned.length === 0) return { recorded: 0 };

  const written = await db
    .insert(accountBalanceSnapshots)
    .values(
      owned.map((account) => ({
        accountId: account.id,
        date,
        balance: account.balance,
      })),
    )
    .onConflictDoNothing()
    .returning({ accountId: accountBalanceSnapshots.accountId });

  return { recorded: written.length };
}

export interface NetWorthPoint {
  date: string;
  cash: number;
  investments: number;
  total: number;
}

/**
 * One point per day the portfolio series covers, with cash carried forward
 * from the most recent snapshot on or before that day.
 *
 * Days before the first snapshot report `cash: 0` rather than a guess — the
 * caller is told where real cash history begins via `cashFrom` so the chart can
 * say so instead of implying the user once had nothing.
 */
export async function getNetWorthSeries(
  userId: string,
  range: TimeRange = "6mo",
  /**
   * A snapshot the caller already computed, replayed over "max" with its
   * series. The dashboard needs the portfolio twice — the summary cards and
   * this chart — and one replay serves both: a day's value is the same whatever
   * range is asked for, so the chart's window is a slice of the full series.
   */
  precomputed?: Pick<PortfolioSnapshot, "series">,
): Promise<{ points: NetWorthPoint[]; cashFrom: string | null }> {
  // Snapshots are cheap to keep current, and doing it here means the history
  // accumulates for anyone who ever opens the dashboard.
  await recordBalanceSnapshots(userId);

  const snapshot =
    precomputed ??
    (await investmentRepository.getPortfolioSnapshot(userId, range, true));

  const from = periodStartIso(range, todayIso());
  const series = from
    ? snapshot.series.filter((point) => point.date >= from)
    : snapshot.series;
  if (series.length === 0) return { points: [], cashFrom: null };

  const rows = await db
    .select({
      date: accountBalanceSnapshots.date,
      balance: accountBalanceSnapshots.balance,
      accountId: accountBalanceSnapshots.accountId,
    })
    .from(accountBalanceSnapshots)
    .innerJoin(accounts, eq(accounts.id, accountBalanceSnapshots.accountId))
    .where(
      and(
        eq(accounts.userId, userId),
        gte(accountBalanceSnapshots.date, series[0]!.date),
      ),
    )
    .orderBy(accountBalanceSnapshots.date);

  // Total cash per day, then a step function over the chart's dates.
  const cashByDate = new Map<string, number>();
  const latestPerAccount = new Map<number, number>();
  for (const row of rows) {
    latestPerAccount.set(row.accountId, row.balance);
    let total = 0;
    for (const balance of latestPerAccount.values()) total += balance;
    cashByDate.set(row.date, total);
  }

  const cashFrom = rows[0]?.date ?? null;
  let carried = 0;

  const points = series.map((point) => {
    carried = cashByDate.get(point.date) ?? carried;
    const cash = cashFrom && point.date >= cashFrom ? carried : 0;
    return {
      date: point.date,
      cash,
      investments: point.value,
      total: cash + point.value,
    };
  });

  return { points, cashFrom };
}

/**
 * Everything the dashboard shows about investments, from one replay.
 *
 * The page used to run two: `getPortfolioSnapshot` for the summary cards and
 * `getNetWorthSeries` for the chart, each reading the whole ledger, every
 * market series, and walking every day since the first trade. The summary is
 * the same whatever range the chart asks for, so the chart is cut from the
 * snapshot the cards already needed.
 */
export async function getDashboardOverview(
  userId: string,
  chartRange: TimeRange = "1y",
) {
  const snapshot = await investmentRepository.getPortfolioSnapshot(
    userId,
    "max",
    true,
  );
  const netWorth = await getNetWorthSeries(userId, chartRange, snapshot);
  return { summary: snapshot.summary, netWorth };
}
