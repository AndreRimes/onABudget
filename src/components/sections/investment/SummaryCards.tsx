"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import type { RouterOutputs } from "~/trpc/react";
import { formatCurrency, formatPercent } from "./format";

type Snapshot = RouterOutputs["investments"]["getPortfolioSnapshot"];

export function SummaryCards({ summary }: { summary: Snapshot["summary"] }) {
  const gainPositive = summary.periodGain >= 0;
  const valueGain = summary.periodGain - summary.periodDividends;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatCurrency(summary.totalValue)}
          </div>
          {summary.dailyChange !== 0 && (
            <p
              className={`text-xs font-medium ${
                summary.dailyChange >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {summary.dailyChange >= 0 ? "+" : ""}
              {formatCurrency(summary.dailyChange)} hoje
            </p>
          )}
          {summary.quotesAsOf && (
            <p className="text-xs text-muted-foreground">
              Atualizado às{" "}
              {new Date(summary.quotesAsOf).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Investido</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatCurrency(summary.totalInvested)}
          </div>
          {summary.realizedGain !== 0 && (
            <p className="text-xs text-muted-foreground">
              Ganho realizado: {formatCurrency(summary.realizedGain)}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Ganho no Período
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`flex items-center gap-2 text-2xl font-bold ${
              gainPositive ? "text-green-600" : "text-red-600"
            }`}
          >
            {gainPositive ? (
              <TrendingUp className="h-5 w-5" />
            ) : (
              <TrendingDown className="h-5 w-5" />
            )}
            {formatCurrency(summary.periodGain)}
          </div>
          {summary.periodDividends > 0 && (
            <p className="text-xs text-muted-foreground">
              {formatCurrency(valueGain)} valorização +{" "}
              {formatCurrency(summary.periodDividends)} proventos
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Rentabilidade no Período
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`text-2xl font-bold ${
              summary.periodGainPercent >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {formatPercent(summary.periodGainPercent)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Proventos (12m)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatCurrency(summary.dividends12m)}
          </div>
          <p className="text-xs text-muted-foreground">
            Média mensal: {formatCurrency(summary.monthlyIncome)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
