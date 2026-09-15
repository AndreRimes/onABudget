import { api, HydrateClient } from "~/trpc/server";
import { DashboardClient } from "./DashboardClient";

/**
 * Server shell for the dashboard. Its only job is to start the queries that do
 * not depend on the viewer's clock, so their data is already in the cache when
 * the client component mounts instead of being requested a round trip later.
 *
 * The expense queries are deliberately *not* prefetched: their windows are
 * built from `new Date()` in the browser, and computing them here would use
 * the server's timezone instead. On the last evening of a month that is
 * already the next month in UTC, which would show the wrong month's spending —
 * a worse trade than the round trip it saves.
 *
 * `void` rather than `await`: the point is to start them and let the streamed
 * response carry whatever has resolved, not to block the shell on the slowest.
 */
/**
 * Never prerendered: the prefetches below read the caller's session, which does
 * not exist at build time. Without this the production build fails outright
 * while trying to generate a static /dashboard.
 */
export const dynamic = "force-dynamic";

export default function DashboardPage() {
  void api.account.getAll.prefetch();
  void api.budget.getLatest.prefetch();
  // Much the slowest of the three — it reaches out for quotes and benchmarks.
  void api.investments.getPortfolioSnapshot.prefetch({
    range: "max",
    includeSeries: false,
  });

  return (
    <HydrateClient>
      <DashboardClient />
    </HydrateClient>
  );
}
