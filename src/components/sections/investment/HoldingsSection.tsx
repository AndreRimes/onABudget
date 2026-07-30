"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
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
import { FixedIncomeBadges, PriceStatusBadge, type Holding } from "./AssetBadges";
import { assetDetailHref } from "./asset-href";
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
  formatSignedPercent,
  gainTone,
} from "./format";

/** Compact stacked layout for narrow screens, where 9 columns cannot fit. */
function HoldingCard({
  holding,
  totalValue,
}: {
  holding: Holding;
  totalValue: number;
}) {
  return (
    <Link
      href={assetDetailHref(holding.assetName)}
      className="block rounded-lg border p-3 transition-colors hover:bg-accent/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <span className="flex flex-wrap items-center gap-2 font-medium">
            {holding.assetName}
            <PriceStatusBadge holding={holding} />
          </span>
          <FixedIncomeBadges holding={holding} />
          <p className="text-xs text-muted-foreground tabular-nums">
            {holding.quantity.toLocaleString("pt-BR", {
              maximumFractionDigits: 6,
            })}{" "}
            × {formatCurrency(holding.currentPrice)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-semibold tabular-nums">
            {formatCurrency(holding.currentValue)}
          </p>
          <p
            className={`text-sm font-medium tabular-nums ${gainTone(
              holding.periodGain,
            )}`}
          >
            {formatSignedCurrency(holding.periodGain)}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatSignedPercent(holding.periodGainPercent)}
            {totalValue > 0 &&
              ` · ${formatPercent((holding.currentValue / totalValue) * 100)} da carteira`}
          </p>
        </div>
      </div>
    </Link>
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
                    className={`text-sm font-medium tabular-nums ${gainTone(groupGain)}`}
                  >
                    {formatSignedCurrency(groupGain)} no período
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Below lg the 9-column table is unreadable, so the same data
                  is stacked into per-asset cards instead of forcing a
                  horizontal scroll. */}
              <div className="space-y-2 lg:hidden">
                {groupHoldings.map((holding) => (
                  <HoldingCard
                    key={holding.assetName}
                    holding={holding}
                    totalValue={totalValue}
                  />
                ))}
              </div>

              <div className="hidden overflow-x-auto lg:block">
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
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupHoldings.map((holding) => (
                      <TableRow key={holding.assetName}>
                        <TableCell className="font-medium">
                          {/* The link lives on the name cell so the whole row
                              stays keyboard-reachable through a single stop. */}
                          <Link
                            href={assetDetailHref(holding.assetName)}
                            className="flex flex-col gap-1 hover:underline"
                          >
                            <span className="flex items-center gap-2">
                              {holding.assetName}
                              <PriceStatusBadge holding={holding} />
                            </span>
                            <FixedIncomeBadges holding={holding} />
                          </Link>
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
                              <span>
                                {formatCurrency(holding.dividendsTotal)}
                              </span>
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
                          <div className="flex flex-col items-end">
                            <span
                              className={`font-medium tabular-nums ${gainTone(
                                holding.periodGain,
                              )}`}
                            >
                              {formatSignedCurrency(holding.periodGain)}
                            </span>
                            <span
                              className={`text-xs tabular-nums ${gainTone(
                                holding.periodGainPercent,
                              )}`}
                            >
                              {formatSignedPercent(holding.periodGainPercent)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {/* Per-row edit/rename/delete now live on the detail
                              page, which has room to explain what they do. */}
                          <Link
                            href={assetDetailHref(holding.assetName)}
                            aria-label={`Ver detalhes de ${holding.assetName}`}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}
