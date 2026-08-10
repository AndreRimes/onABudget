"use client";

import { keepPreviousData } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  FileUp,
  HandCoins,
  Plus,
} from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
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

type OverflowDialog = "importB3" | "dividend" | "assetType";

export default function InvestmentsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("max");
  const [openDialog, setOpenDialog] = useState<OverflowDialog | null>(null);

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Investimentos</h1>

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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                Mais ações
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setOpenDialog("importB3")}>
                <FileUp className="mr-2 h-4 w-4" />
                Importar B3
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setOpenDialog("dividend")}>
                <HandCoins className="mr-2 h-4 w-4" />
                Registrar provento
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setOpenDialog("assetType")}>
                <Plus className="mr-2 h-4 w-4" />
                Novo tipo de ativo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <CreateInvestmentDialog />
        </div>
      </div>

      {/* Controlled from the menu above: a trigger nested in the dropdown would
          be unmounted with the menu before the dialog could open. */}
      <ImportB3Dialog
        open={openDialog === "importB3"}
        onOpenChange={(next) => setOpenDialog(next ? "importB3" : null)}
      />
      <AddDividendDialog
        open={openDialog === "dividend"}
        onOpenChange={(next) => setOpenDialog(next ? "dividend" : null)}
      />
      <CreateAssetTypeDialog
        open={openDialog === "assetType"}
        onOpenChange={(next) => setOpenDialog(next ? "assetType" : null)}
      />

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
