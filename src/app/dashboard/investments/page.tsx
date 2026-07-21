"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { api } from "~/trpc/react";
import { CreateInvestmentDialog } from "~/components/sections/investment/CreateInvestmentDialog";
import { AddDividendDialog } from "~/components/sections/investment/AddDividendDialog";
import { ImportB3Dialog } from "~/components/sections/investment/ImportB3Dialog";
import { CreateAssetTypeDialog } from "~/components/sections/asset-type/CreateAssetTypeDialog";
import { AllocationDonut } from "~/components/sections/investment/AllocationDonut";
import { HoldingsSection } from "~/components/sections/investment/HoldingsSection";
import { InvestmentsSkeleton } from "~/components/sections/investment/InvestmentsSkeleton";
import { PerformanceChart } from "~/components/sections/investment/PerformanceChart";
import { SummaryCards } from "~/components/sections/investment/SummaryCards";

type TimeRange = "1d" | "5d" | "1mo" | "6mo" | "1y" | "max";

const timeRangeLabels: Record<TimeRange, string> = {
  "1d": "Hoje",
  "5d": "Esta semana",
  "1mo": "Último mês",
  "6mo": "Últimos 6 meses",
  "1y": "Último ano",
  max: "Todo o período",
};

export default function InvestmentsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("max");

  const {
    data: snapshot,
    isPending,
    isError,
    error,
    refetch,
    isFetching,
  } = api.investments.getPortfolioSnapshot.useQuery(
    { range: timeRange },
    { staleTime: 5 * 60 * 1000, placeholderData: keepPreviousData, retry: 1 },
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Investimentos</h1>

        <div className="flex gap-3">
          <CreateAssetTypeDialog />
          <ImportB3Dialog />
          <AddDividendDialog />
          <CreateInvestmentDialog />
        </div>
      </div>

      <div className="flex justify-end">
        <Select
          value={timeRange}
          onValueChange={(value) => setTimeRange(value as TimeRange)}
        >
          <SelectTrigger className="w-45">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(timeRangeLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError && !snapshot ? (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex flex-col items-start gap-3 py-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div className="space-y-1 text-sm">
                <p className="font-medium">
                  Não foi possível carregar os investimentos.
                </p>
                <p className="text-muted-foreground">{error.message}</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              {isFetching ? "Tentando..." : "Tentar novamente"}
            </Button>
          </CardContent>
        </Card>
      ) : isPending || !snapshot ? (
        <InvestmentsSkeleton />
      ) : (
        <>
          {snapshot.issues.length > 0 && (
            <Card className="border-amber-500/50 bg-amber-500/5">
              <CardContent className="flex items-start gap-3 py-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div className="space-y-1 text-sm">
                  {snapshot.issues.map((issue) => (
                    <p key={issue.assetName} className="text-muted-foreground">
                      {issue.message}
                    </p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <SummaryCards summary={snapshot.summary} />

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <PerformanceChart series={snapshot.series} />
            </div>
            <AllocationDonut
              holdings={snapshot.holdings}
              totalValue={snapshot.summary.totalValue}
            />
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold">
              Investimentos por Tipo de Ativo
            </h2>
            <HoldingsSection
              holdings={snapshot.holdings}
              totalValue={snapshot.summary.totalValue}
            />
          </div>
        </>
      )}
    </div>
  );
}
