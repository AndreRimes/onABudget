"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { type ReactNode, useState } from "react";
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
import { AllocationDonut, PerformanceChart } from "~/components/lazy-charts";
import { CreateInvestmentDialog } from "~/components/sections/investment/CreateInvestmentDialog";
import { InvestmentActions } from "~/components/sections/investment/InvestmentActions";
import { HoldingsSection } from "~/components/sections/investment/HoldingsSection";
import { InvestmentsSkeleton } from "~/components/sections/investment/InvestmentsSkeleton";
import { ReconciliationCard } from "~/components/sections/investment/ReconciliationCard";
import { RefreshQuotesButton } from "~/components/sections/investment/RefreshQuotesButton";
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

export function InvestmentsClient() {
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

  let content: ReactNode;
  if (isError && !snapshot) {
    content = (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="flex flex-col items-start gap-3 py-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-destructive mt-0.5 h-5 w-5 shrink-0" />
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
    );
  } else if (isPending || !snapshot) {
    content = <InvestmentsSkeleton />;
  } else {
    content = (
      <>
        {snapshot.issues.length > 0 && (
          <Card className="bg-highlight/50">
            <CardContent className="flex items-start gap-3 py-4">
              <AlertTriangle className="text-foreground mt-0.5 h-5 w-5 shrink-0" />
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

        <ReconciliationCard reconciliation={snapshot.reconciliation} />

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
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="form-label">FORM IN-01 · CARTEIRA</p>
          <h1 className="display mt-1">INVESTIMENTOS</h1>
        </div>

        {/* One primary action; the rest live behind a single overflow trigger
            so the row no longer wraps into four equal-weight buttons. */}
        <div className="flex flex-wrap items-center gap-2">
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

          <RefreshQuotesButton />

          <InvestmentActions />

          <CreateInvestmentDialog />
        </div>
      </div>

      {content}
    </div>
  );
}
