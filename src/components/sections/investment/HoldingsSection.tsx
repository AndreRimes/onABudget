"use client";

import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  AssetTitle,
  FixedIncomeBadges,
  PriceStatusBadge,
  type Holding,
} from "./AssetBadges";
import {
  InvestmentTable,
  InvestmentTableControls,
  type InvestmentColumn,
  useInvestmentTable,
} from "./InvestmentTable";
import { assetDetailHref } from "./asset-href";
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
  formatSignedPercent,
  gainTone,
} from "./format";

export function HoldingsSection({
  holdings,
  totalValue,
}: Readonly<{
  holdings: Holding[];
  totalValue: number;
}>) {
  const columns: InvestmentColumn<Holding>[] = [
    {
      id: "asset",
      label: "Ativo",
      width: "w-1/4",
      value: (holding) => holding.label || holding.assetName,
      render: (holding) => (
        <Link
          href={assetDetailHref(holding.assetName)}
          className="flex flex-col items-start gap-1 font-medium hover:underline"
        >
          <AssetTitle holding={holding} />
          <PriceStatusBadge holding={holding} />
          <FixedIncomeBadges holding={holding} />
        </Link>
      ),
    },
    {
      id: "quantity",
      label: "Quantidade",
      align: "right",
      value: (holding) => holding.quantity,
      format: (holding) =>
        holding.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 6 }),
    },
    {
      id: "average",
      label: "Preço médio",
      align: "right",
      value: (holding) => holding.averageCost,
      format: (holding) => formatCurrency(holding.averageCost),
    },
    {
      id: "price",
      label: "Preço atual",
      align: "right",
      value: (holding) => holding.currentPrice,
      format: (holding) => formatCurrency(holding.currentPrice),
    },
    {
      id: "total",
      label: "Valor total",
      align: "right",
      value: (holding) => holding.currentValue,
      format: (holding) => formatCurrency(holding.currentValue),
      render: (holding) => (
        <strong>{formatCurrency(holding.currentValue)}</strong>
      ),
    },
    {
      id: "weight",
      label: "% Carteira",
      align: "right",
      value: (holding) =>
        totalValue > 0 ? (holding.currentValue / totalValue) * 100 : 0,
      format: (holding) =>
        totalValue > 0
          ? formatPercent((holding.currentValue / totalValue) * 100)
          : "—",
    },
    {
      id: "dividends",
      label: "Proventos",
      align: "right",
      value: (holding) => holding.dividendsTotal,
      format: (holding) =>
        holding.dividendsTotal > 0
          ? formatCurrency(holding.dividendsTotal)
          : "—",
      render: (holding) =>
        holding.dividendsTotal > 0 ? (
          <>
            {formatCurrency(holding.dividendsTotal)}
            {holding.dividends12m > 0 && (
              <span className="text-muted-foreground block text-xs">
                12m: {formatCurrency(holding.dividends12m)}
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "gain",
      label: "Ganho no período",
      align: "right",
      value: (holding) => holding.periodGain,
      format: (holding) => formatSignedCurrency(holding.periodGain),
      render: (holding) => (
        <>
          <span className={`font-medium ${gainTone(holding.periodGain)}`}>
            {formatSignedCurrency(holding.periodGain)}
          </span>
          <span
            className={`block text-xs ${gainTone(holding.periodGainPercent)}`}
          >
            {formatSignedPercent(holding.periodGainPercent)}
          </span>
        </>
      ),
    },
  ];

  const view = useInvestmentTable(
    columns,
    (holding) => `${holding.assetName} ${holding.assetTypeName}`,
  );
  const groups = new Map<string, Holding[]>();
  for (const holding of holdings) {
    const group = groups.get(holding.assetTypeName);
    if (group) group.push(holding);
    else groups.set(holding.assetTypeName, [holding]);
  }

  if (groups.size === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-8 text-center">
          Nenhum investimento encontrado
        </CardContent>
      </Card>
    );
  }

  const visibleGroups = [...groups].flatMap(([assetTypeName, group]) => {
    const rows = view.visibleRows(group);
    return rows.length ? [{ assetTypeName, group, rows }] : [];
  });

  return (
    <>
      <InvestmentTableControls
        view={view}
        searchLabel="Buscar ativo, código ou tipo"
      />
      {visibleGroups.length === 0 && (
        <p role="status" className="text-muted-foreground py-6 text-center">
          Nenhum ativo corresponde à busca.
        </p>
      )}
      {visibleGroups.map(({ assetTypeName, group, rows }) => {
        const groupTotal = group.reduce(
          (sum, holding) => sum + holding.currentValue,
          0,
        );
        const groupGain = group.reduce(
          (sum, holding) => sum + holding.periodGain,
          0,
        );

        return (
          <Card key={assetTypeName}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>{assetTypeName}</CardTitle>
                  <CardDescription>
                    {rows.length < group.length
                      ? `${rows.length} de ${group.length} ativos`
                      : `${group.length} ${group.length === 1 ? "ativo" : "ativos"}`}
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
            <CardContent className="px-3 sm:px-6">
              <InvestmentTable
                rows={rows}
                rowKey={(holding) => holding.assetName}
                view={view}
                label={assetTypeName}
              />
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}
