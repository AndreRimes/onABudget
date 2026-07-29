"use client";

import { format, parseISO } from "date-fns";
import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Badge } from "~/components/ui/badge";
import type { RouterOutputs } from "~/trpc/react";
import { DeleteAssetDialog } from "./DeleteAssetDialog";
import { EditFixedIncomeDialog } from "./EditFixedIncomeDialog";
import { RenameAssetDialog } from "./RenameAssetDialog";
import { formatCurrency, formatPercent } from "./format";

type Snapshot = RouterOutputs["investments"]["getPortfolioSnapshot"];
type Holding = Snapshot["holdings"][number];

function PriceStatusBadge({ holding }: { holding: Holding }) {
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

export function HoldingsSection({
  holdings,
  totalValue,
}: {
  holdings: Holding[];
  totalValue: number;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, Holding[]>();
    for (const holding of holdings) {
      const list = map.get(holding.assetTypeName);
      if (list) {
        list.push(holding);
      } else {
        map.set(holding.assetTypeName, [holding]);
      }
    }
    return [...map.entries()];
  }, [holdings]);

  if (groups.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">
            Nenhum investimento encontrado
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {groups.map(([assetTypeName, groupHoldings]) => {
        const groupTotal = groupHoldings.reduce(
          (sum, holding) => sum + holding.currentValue,
          0,
        );
        const groupGain = groupHoldings.reduce(
          (sum, holding) => sum + holding.periodGain,
          0,
        );

        return (
          <Card key={assetTypeName}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{assetTypeName}</CardTitle>
                  <CardDescription>
                    {groupHoldings.length} ativo
                    {groupHoldings.length !== 1 ? "s" : ""}
                  </CardDescription>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">
                    {formatCurrency(groupTotal)}
                  </p>
                  <p
                    className={`text-sm font-medium ${
                      groupGain >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {groupGain >= 0 ? "+" : ""}
                    {formatCurrency(groupGain)} no período
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ativo</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead className="text-right">Preço Médio</TableHead>
                    <TableHead className="text-right">Preço Atual</TableHead>
                    <TableHead className="text-right">Valor Total</TableHead>
                    <TableHead className="text-right">% Carteira</TableHead>
                    <TableHead className="text-right">Proventos</TableHead>
                    <TableHead className="text-right">
                      Ganho no Período
                    </TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupHoldings.map((holding) => (
                    <TableRow key={holding.assetName}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            {holding.assetName}
                            <PriceStatusBadge holding={holding} />
                          </div>
                          {holding.isFixedIncome && (
                            <div className="flex items-center gap-1">
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
                                    : holding.fixedIncomeYieldType ===
                                        "CDI_PERCENTAGE"
                                      ? `${holding.fixedIncomeRate}% CDI`
                                      : `${holding.fixedIncomeRate}% a.a.`}
                                </Badge>
                              )}
                              {holding.fixedIncomeMaturityDate && (
                                <span className="text-xs text-muted-foreground">
                                  Venc:{" "}
                                  {format(
                                    parseISO(holding.fixedIncomeMaturityDate),
                                    "dd/MM/yyyy",
                                  )}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {holding.quantity.toLocaleString("pt-BR", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 6,
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(holding.averageCost)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(holding.currentPrice)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(holding.currentValue)}
                      </TableCell>
                      <TableCell className="text-right">
                        {totalValue > 0
                          ? formatPercent(
                              (holding.currentValue / totalValue) * 100,
                            )
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {holding.dividendsTotal > 0 ? (
                          <div className="flex flex-col items-end">
                            <span>{formatCurrency(holding.dividendsTotal)}</span>
                            {holding.dividends12m > 0 && (
                              <span className="text-xs text-muted-foreground">
                                12m: {formatCurrency(holding.dividends12m)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span
                            className={`font-medium ${
                              holding.periodGain >= 0
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {holding.periodGain >= 0 ? "+" : ""}
                            {formatCurrency(holding.periodGain)}
                          </span>
                          <Badge
                            variant={
                              holding.periodGainPercent >= 0
                                ? "default"
                                : "destructive"
                            }
                            className="text-xs"
                          >
                            {holding.periodGainPercent >= 0 ? "+" : ""}
                            {formatPercent(holding.periodGainPercent)}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {holding.isFixedIncome && (
                            <RenameAssetDialog assetName={holding.assetName} />
                          )}
                          {holding.isFixedIncome && !holding.tesouroTitle && (
                            <EditFixedIncomeDialog
                              assetName={holding.assetName}
                              yieldType={holding.fixedIncomeYieldType}
                              rate={holding.fixedIncomeRate}
                              maturityDate={holding.fixedIncomeMaturityDate}
                            />
                          )}
                          <DeleteAssetDialog assetName={holding.assetName} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}
