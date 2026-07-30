"use client";

import { format, parseISO } from "date-fns";
import { Badge } from "~/components/ui/badge";
import type { RouterOutputs } from "~/trpc/react";

type Snapshot = RouterOutputs["investments"]["getPortfolioSnapshot"];
export type Holding = Snapshot["holdings"][number];

/**
 * Flags a holding whose price couldn't be refreshed. Renders nothing when the
 * price is trustworthy, so it can be dropped next to any asset name.
 */
export function PriceStatusBadge({ holding }: { holding: Holding }) {
  if (holding.priceStatus === "ok" || holding.priceStatus === "fixed_income") {
    return null;
  }
  const label =
    holding.priceStatus === "not_found" ? "Sem cotação" : "Desatualizada";
  const title =
    holding.priceStatus === "not_found"
      ? "Ativo não encontrado na API de cotações; usando o preço médio de compra."
      : "Não foi possível atualizar a cotação; exibindo o último valor conhecido.";
  return (
    <Badge
      variant="outline"
      title={title}
      className="border-amber-500 text-xs text-amber-600"
    >
      {label}
    </Badge>
  );
}

/**
 * How a fixed-income position is valued: official Tesouro PU, or an accrual at
 * a given rate. Renders nothing for market assets.
 */
export function FixedIncomeBadges({ holding }: { holding: Holding }) {
  if (!holding.isFixedIncome) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {holding.tesouroTitle ? (
        <Badge
          variant="secondary"
          className="text-xs"
          title="Valor calculado pelo preço oficial diário do Tesouro Direto (marcação a mercado)."
        >
          Tesouro · preço de mercado
        </Badge>
      ) : (
        <Badge
          variant="secondary"
          className="text-xs"
          title={
            holding.fixedIncomeRate == null
              ? "Defina a taxa para que o rendimento seja calculado."
              : undefined
          }
        >
          {holding.fixedIncomeRate == null ||
          holding.fixedIncomeYieldType == null
            ? "Taxa não definida"
            : holding.fixedIncomeYieldType === "CDI_PERCENTAGE"
              ? `${holding.fixedIncomeRate}% CDI`
              : `${holding.fixedIncomeRate}% a.a.`}
        </Badge>
      )}
      {holding.fixedIncomeMaturityDate && (
        <span className="text-xs text-muted-foreground">
          Venc:{" "}
          {format(parseISO(holding.fixedIncomeMaturityDate), "dd/MM/yyyy")}
        </span>
      )}
    </div>
  );
}
