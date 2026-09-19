"use client";

import { format, parseISO } from "date-fns";
import { Badge } from "~/components/ui/badge";
import type { RouterOutputs } from "~/trpc/react";

type Snapshot = RouterOutputs["investments"]["getPortfolioSnapshot"];
export type Holding = Snapshot["holdings"][number];

/**
 * An asset's name as it should be read.
 *
 * The ledger key is the provider's code — a fund's CNPJ, a CDB's issuer code —
 * because that is what is unique and what the price sources are keyed by. When
 * a readable name came with it, that name leads and the code stays underneath
 * as the identifier: two CDBs from the same bank are told apart only by it.
 */
export function AssetTitle({ holding }: Readonly<{ holding: Holding }>) {
  if (!holding.label) return <>{holding.assetName}</>;
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate">{holding.label}</span>
      <span className="text-muted-foreground font-mono text-[11px] font-normal">
        {holding.assetName}
      </span>
    </span>
  );
}

/**
 * Flags a holding whose price couldn't be refreshed. Renders nothing when the
 * price is trustworthy, so it can be dropped next to any asset name.
 */
export function PriceStatusBadge({ holding }: Readonly<{ holding: Holding }>) {
  if (holding.priceStatus === "ok" || holding.priceStatus === "fixed_income") {
    return null;
  }
  // Trustworthy by the owner's own choice, but worth saying: it is not a
  // market quote and will not move until the bank reports a new figure.
  if (holding.priceStatus === "provider") {
    return (
      <Badge
        variant="outline"
        title="Avaliado pelo preço que o banco informou na última sincronização, por escolha sua na conferência."
        className="bg-highlight text-[10px]"
      >
        Preço do banco
      </Badge>
    );
  }
  const label =
    holding.priceStatus === "not_found" ? "Sem cotação" : "Desatualizada";
  const title =
    holding.priceStatus === "not_found"
      ? "Ativo não encontrado na API de cotações; usando o preço médio de compra."
      : "Não foi possível atualizar a cotação; exibindo o último valor conhecido.";
  return (
    <Badge variant="outline" title={title} className="bg-highlight text-[10px]">
      {label}
    </Badge>
  );
}

/**
 * How a fixed-income position is valued: official Tesouro PU, or an accrual at
 * a given rate. Renders nothing for market assets.
 */
function rateLabel(holding: Holding): string {
  if (holding.fixedIncomeRate == null || holding.fixedIncomeYieldType == null) {
    return "Taxa não definida";
  }
  return holding.fixedIncomeYieldType === "CDI_PERCENTAGE"
    ? `${holding.fixedIncomeRate}% CDI`
    : `${holding.fixedIncomeRate}% a.a.`;
}

export function FixedIncomeBadges({ holding }: Readonly<{ holding: Holding }>) {
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
          {rateLabel(holding)}
        </Badge>
      )}
      {holding.fixedIncomeMaturityDate && (
        <span className="text-muted-foreground text-xs">
          Venc:{" "}
          {format(parseISO(holding.fixedIncomeMaturityDate), "dd/MM/yyyy")}
        </span>
      )}
    </div>
  );
}
