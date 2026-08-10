"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import {
  FixedIncomeBadges,
  PriceStatusBadge,
} from "~/components/sections/investment/AssetBadges";
import { DeleteAssetDialog } from "~/components/sections/investment/DeleteAssetDialog";
import { DividendsTable } from "~/components/sections/investment/DividendsTable";
import { EditFixedIncomeDialog } from "~/components/sections/investment/EditFixedIncomeDialog";
import { PerformanceChart } from "~/components/sections/investment/PerformanceChart";
import { RefreshQuotesButton } from "~/components/sections/investment/RefreshQuotesButton";
import { RenameAssetDialog } from "~/components/sections/investment/RenameAssetDialog";
import { TransactionsTable } from "~/components/sections/investment/TransactionsTable";
import { assetDetailHref } from "~/components/sections/investment/asset-href";
import {
  formatCurrency,
  formatSignedCurrency,
  formatSignedPercent,
  gainTone,
} from "~/components/sections/investment/format";
import { api } from "~/trpc/react";

type TimeRange = "1d" | "5d" | "1mo" | "6mo" | "1y" | "max";

const timeRangeLabels: Record<TimeRange, string> = {
  "1d": "Hoje",
  "5d": "Esta semana",
  "1mo": "Último mês",
  "6mo": "Últimos 6 meses",
  "1y": "Último ano",
  max: "Todo o período",
};

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "positive" | "negative";
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={`text-2xl font-bold tabular-nums ${
            tone === "positive"
              ? "text-profit"
              : tone === "negative"
                ? "text-loss"
                : ""
          }`}
        >
          {value}
        </div>
        {hint && (
          <p className="text-xs text-muted-foreground tabular-nums">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function AssetDetailPage() {
  const params = useParams<{ assetName: string }>();
  const router = useRouter();
  const [timeRange, setTimeRange] = useState<TimeRange>("max");

  // Fixed-income names are free-form, so the segment is percent-encoded.
  const assetName = decodeURIComponent(params.assetName);

  const {
    data: snapshot,
    isPending,
    isError,
    error,
    refetch,
    isFetching,
  } = api.investments.getPortfolioSnapshot.useQuery(
    { range: timeRange, assetName },
    { staleTime: 5 * 60 * 1000, placeholderData: keepPreviousData, retry: 1 },
  );

  const holding = snapshot?.holdings[0];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/dashboard/investments"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Investimentos
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold">{assetName}</h1>
            {holding && (
              <>
                <Badge variant="outline">{holding.assetTypeName}</Badge>
                <PriceStatusBadge holding={holding} />
              </>
            )}
          </div>
          {holding && <FixedIncomeBadges holding={holding} />}
        </div>

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

          {/* Only assets priced from a provider can be refreshed; a plain
              fixed-income position is accrued, not quoted. */}
          {holding && (!holding.isFixedIncome || holding.tesouroTitle) && (
            <RefreshQuotesButton assetName={assetName} />
          )}

          <RenameAssetDialog
            assetName={assetName}
            onRenamed={(newName) => router.replace(assetDetailHref(newName))}
          />
          {holding?.isFixedIncome && !holding.tesouroTitle && (
            <EditFixedIncomeDialog
              assetName={assetName}
              yieldType={holding.fixedIncomeYieldType}
              rate={holding.fixedIncomeRate}
              maturityDate={holding.fixedIncomeMaturityDate}
            />
          )}
          <DeleteAssetDialog
            assetName={assetName}
            onDeleted={() => router.push("/dashboard/investments")}
          />
        </div>
      </div>

      {isError && !snapshot ? (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex flex-col items-start gap-3 py-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div className="space-y-1 text-sm">
                <p className="font-medium">
                  Não foi possível carregar este ativo.
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
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-28 w-full" />
            ))}
          </div>
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
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

          {holding ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Valor Total"
                value={formatCurrency(holding.currentValue)}
                hint={`${holding.quantity.toLocaleString("pt-BR", {
                  maximumFractionDigits: 6,
                })} × ${formatCurrency(holding.currentPrice)}`}
              />
              <Stat
                label="Preço Médio"
                value={formatCurrency(holding.averageCost)}
                hint={`Custo total: ${formatCurrency(holding.totalCost)}`}
              />
              <Stat
                label="Ganho no Período"
                value={formatSignedCurrency(holding.periodGain)}
                hint={`${formatSignedPercent(holding.periodGainPercent)} de rentabilidade`}
                tone={holding.periodGain >= 0 ? "positive" : "negative"}
              />
              <Stat
                label="Proventos"
                value={formatCurrency(holding.dividendsTotal)}
                hint={
                  holding.dividends12m > 0
                    ? `12m: ${formatCurrency(holding.dividends12m)}`
                    : undefined
                }
              />
            </div>
          ) : (
            <Card>
              <CardContent className="py-6">
                <p className="text-muted-foreground">
                  Você não tem mais posição neste ativo. O histórico abaixo
                  continua disponível.
                </p>
                {snapshot.summary.realizedGain !== 0 && (
                  <p className="mt-1 text-sm">
                    Ganho realizado:{" "}
                    <span
                      className={`font-medium tabular-nums ${gainTone(
                        snapshot.summary.realizedGain,
                      )}`}
                    >
                      {formatCurrency(snapshot.summary.realizedGain)}
                    </span>
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <PerformanceChart
            series={snapshot.series}
            title={`Evolução de ${assetName} vs CDI`}
            description="Ganho acumulado no período (incluindo proventos) comparado ao CDI sobre os mesmos aportes neste ativo"
          />

          <TransactionsTable assetName={assetName} />
          <DividendsTable assetName={assetName} />
        </>
      )}
    </div>
  );
}
