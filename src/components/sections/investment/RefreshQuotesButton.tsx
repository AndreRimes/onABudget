"use client";

import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";

/**
 * Forces the quote refresh that otherwise only happens on the cache TTL, so a
 * price is re-read from the provider at the moment the user clicks.
 *
 * With `assetName` it refreshes that single position; without it, every held
 * position. The snapshot is invalidated afterwards so the whole page (values,
 * gains, chart) is recomputed from the prices that were just fetched.
 */
export function RefreshQuotesButton({ assetName }: { assetName?: string }) {
  const utils = api.useUtils();

  const { mutate, isPending } = api.investments.refreshQuotes.useMutation({
    onSuccess: async (result) => {
      // Awaited so the button keeps spinning until the refetched snapshot is
      // on screen — settling earlier would flash the old numbers as "updated".
      await utils.investments.getPortfolioSnapshot.invalidate();

      const time = new Date(result.refreshedAt).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      const failed = result.quotes.filter((quote) => quote.status !== "ok");

      if (result.quotes.length === 0) {
        toast.info("Nenhuma cotação para atualizar");
      } else if (failed.length === 0) {
        toast.success(`Cotações atualizadas às ${time}`);
      } else {
        toast.warning(
          `Cotações atualizadas às ${time}, exceto: ${failed
            .map((quote) => quote.assetName)
            .join(", ")}`,
        );
      }
    },
    onError: (error) => {
      toast.error("Erro ao atualizar cotações: " + error.message);
    },
  });

  return (
    <Button
      variant="outline"
      disabled={isPending}
      onClick={() => mutate(assetName ? { assetName } : undefined)}
      title="Busca o preço atual na API, ignorando o cache"
    >
      <RefreshCw className={`mr-2 h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
      {isPending
        ? "Atualizando..."
        : assetName
          ? "Atualizar cotação"
          : "Atualizar cotações"}
    </Button>
  );
}
