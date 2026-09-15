import type { api } from "~/trpc/react";

type Utils = ReturnType<typeof api.useUtils>;

/**
 * Drops every cached read of the portfolio, so the next render recomputes it.
 *
 * The portfolio is read through more than one procedure — the investments
 * page's snapshot, the dashboard's overview — and a mutation that touched the
 * ledger has to invalidate all of them, or the dashboard would keep showing
 * yesterday's total for as long as its stale time lasts. One function, so a
 * new read added later has one place to be registered.
 */
export function invalidatePortfolio(utils: Utils): Promise<void> {
  return Promise.all([
    utils.investments.getPortfolioSnapshot.invalidate(),
    utils.account.getDashboardOverview.invalidate(),
    utils.account.getNetWorthSeries.invalidate(),
  ]).then(() => undefined);
}
