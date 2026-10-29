"use client";

import { useEffect, useRef, useState } from "react";
import { startMarketRefreshLoop } from "~/lib/market-refresh-loop";
import type { MarketDataStatus } from "~/lib/market-data";
import { api } from "~/trpc/react";
import { invalidatePortfolio } from "~/trpc/invalidate";
import { Button } from "~/components/ui/button";

/** The refresh request outlives navigation, but its next timer does not. */
export function MarketDataNotice({
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
  const retry = useRef<() => void>(() => undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const available = !!status;

  useEffect(() => {
    if (!available) return;
    let disposed = false;
    setRefreshing(false);
    setFailed(false);
    const loop = startMarketRefreshLoop({
      initiallyDue: latest.current?.needsRefresh ?? false,
      isVisible: () => document.visibilityState === "visible",
      refresh: async () => {
        setRefreshing(true);
        try {
          const result = await mutateAsync(
            assetName ? { assetName } : undefined,
          );
          // Recompute from the current ledger, including edits made during refresh.
          if (result.changed || !result.needsMore)
            await invalidatePortfolio(utils);
          if (!disposed) setFailed(result.outcome === "failed");
          return result.retryAfterMs;
        } catch {
          if (!disposed) setFailed(true);
          return 60_000;
        } finally {
          if (!disposed) setRefreshing(false);
        }
      },
    });
    retry.current = loop.retry;
    document.addEventListener("visibilitychange", loop.onVisibility);
    return () => {
      disposed = true;
      loop.dispose();
      document.removeEventListener("visibilitychange", loop.onVisibility);
      retry.current = () => undefined;
    };
  }, [available, assetName, mutateAsync, utils]);

  if (!status) return null;
  return (
    <div
      className="text-muted-foreground space-y-1 text-xs"
      role="status"
      aria-live="polite"
    >
      {refreshing && <p>Atualizando dados de mercado…</p>}
      {failed && (
        <p>
          Não foi possível atualizar. Os dados disponíveis foram preservados.{" "}
          <Button variant="link" size="sm" onClick={() => retry.current()}>
            Tentar novamente
          </Button>
        </p>
      )}
      {status.isPartial && (
        <p>
          Histórico parcial: valores e rendimentos podem ser estimados enquanto
          faltarem dados de mercado.
        </p>
      )}
      {status.oldestAvailableAsOf && (
        <p>
          Referência mais antiga entre os dados disponíveis:{" "}
          {new Date(status.oldestAvailableAsOf).toLocaleString("pt-BR")}. As
          datas variam por fonte.
        </p>
      )}
      {!refreshing && status.needsRefresh && (
        <p>Exibindo os últimos dados disponíveis.</p>
      )}
    </div>
  );
}
