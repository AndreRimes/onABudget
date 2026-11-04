"use client";

import { useEffect, useRef } from "react";
import { startMarketRefreshLoop } from "~/lib/market-refresh-loop";
import type { MarketDataStatus } from "~/lib/market-data";
import { api } from "~/trpc/react";
import { invalidatePortfolio } from "~/trpc/invalidate";

/**
 * Keeps the market data behind the page fresh without saying so: the server
 * job warms it in the background, and this catches whatever is still due
 * while the page is open, swapping in the new figures when they land.
 * The refresh request outlives navigation, but its next timer does not.
 */
export function MarketDataRefresher({
  status,
  assetName,
}: {
  status: MarketDataStatus | undefined;
  assetName?: string;
}) {
  const utils = api.useUtils();
  const { mutateAsync } = api.investments.refreshMarketData.useMutation({
    retry: false,
  });
  const latest = useRef(status);
  latest.current = status;
  const available = !!status;

  useEffect(() => {
    if (!available) return;
    const loop = startMarketRefreshLoop({
      initiallyDue: latest.current?.needsRefresh ?? false,
      isVisible: () => document.visibilityState === "visible",
      refresh: async () => {
        try {
          const result = await mutateAsync(
            assetName ? { assetName } : undefined,
          );
          // Recompute from the current ledger, including edits made during refresh.
          if (result.changed || !result.needsMore)
            await invalidatePortfolio(utils);
          return result.retryAfterMs;
        } catch {
          return 60_000;
        }
      },
    });
    document.addEventListener("visibilitychange", loop.onVisibility);
    return () => {
      loop.dispose();
      document.removeEventListener("visibilitychange", loop.onVisibility);
    };
  }, [available, assetName, mutateAsync, utils]);

  return null;
}
