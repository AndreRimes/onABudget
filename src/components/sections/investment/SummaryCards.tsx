"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { BENCHMARKS, BENCHMARK_ORDER } from "~/server/api/investments/benchmarks";
import type { RouterOutputs } from "~/trpc/react";
import {
  formatCurrency,
  formatSignedCurrency,
  formatSignedPercent,
  gainTone,
} from "./format";

type Snapshot = RouterOutputs["investments"]["getPortfolioSnapshot"];

function StatCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">{children}</CardContent>
    </Card>
  );
}

export function SummaryCards({ summary }: { summary: Snapshot["summary"] }) {
  const gainPositive = summary.periodGain >= 0;
  const valueGain = summary.periodGain - summary.periodDividends;

  // How the portfolio did against each index over the same window. Positive
  // means the portfolio won.
  const comparisons = BENCHMARK_ORDER.filter(
    (id) => summary.benchmarkGains[id] !== undefined,
  ).map((id) => ({
    id,
    label: BENCHMARKS[id].label,
    diff: summary.periodGain - summary.benchmarkGains[id]!,
  }));

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <StatCard label="Valor Total">
        <div className="text-2xl font-bold tabular-nums">
          {formatCurrency(summary.totalValue)}
        </div>
        {summary.dailyChange !== 0 && (
          <p
            className={`text-xs font-medium tabular-nums ${gainTone(
              summary.dailyChange,
            )}`}
          >
            {formatSignedCurrency(summary.dailyChange)} hoje
          </p>
        )}
        {summary.quotesAsOf && (
          <p className="text-xs text-muted-foreground">
            Cotações de{" "}
            {new Date(summary.quotesAsOf).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
      </StatCard>

      <StatCard label="Total Investido">
        <div className="text-2xl font-bold tabular-nums">
          {formatCurrency(summary.totalInvested)}
        </div>
        {summary.realizedGain !== 0 && (
          <p className="text-xs text-muted-foreground tabular-nums">
            Ganho realizado: {formatCurrency(summary.realizedGain)}
          </p>
        )}
      </StatCard>

      <StatCard label="Ganho no Período">
        <div
          className={`flex items-center gap-2 text-2xl font-bold tabular-nums ${gainTone(
            summary.periodGain,
          )}`}
        >
          {gainPositive ? (
            <TrendingUp className="h-5 w-5 shrink-0" />
          ) : (
            <TrendingDown className="h-5 w-5 shrink-0" />
          )}
          {formatCurrency(summary.periodGain)}
        </div>
        <p
          className={`text-xs font-medium tabular-nums ${gainTone(
            summary.periodGainPercent,
          )}`}
        >
          {formatSignedPercent(summary.periodGainPercent)} de rentabilidade
        </p>
        {summary.periodDividends > 0 && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatCurrency(valueGain)} valorização +{" "}
            {formatCurrency(summary.periodDividends)} proventos
          </p>
        )}
      </StatCard>

      <StatCard label="Proventos (12m)">
        <div className="text-2xl font-bold tabular-nums">
          {formatCurrency(summary.dividends12m)}
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          Média mensal: {formatCurrency(summary.monthlyIncome)}
        </p>
      </StatCard>

      {comparisons.length > 0 && (
        <StatCard label="Carteira × índices">
          <ul className="space-y-1">
            {comparisons.map((comparison) => (
              <li
                key={comparison.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="text-muted-foreground">
                  {comparison.label}
                </span>
                <span
                  className={`font-medium tabular-nums ${gainTone(
                    comparison.diff,
                  )}`}
                >
                  {formatSignedCurrency(comparison.diff)}
                </span>
              </li>
            ))}
          </ul>
          <p className="pt-1 text-xs text-muted-foreground">
            Quanto a carteira rendeu a mais (ou a menos) que cada índice sobre os
            mesmos aportes.
          </p>
        </StatCard>
      )}
    </div>
  );
}
