"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
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
import { api, type RouterOutputs } from "~/trpc/react";
import { PerformanceChart } from "~/components/lazy-charts";

type TimeRange = "1d" | "5d" | "1mo" | "6mo" | "1y" | "max";

const timeRangeLabels: Record<TimeRange, string> = {
  "1d": "Hoje",
  "5d": "Esta semana",
  "1mo": "Último mês",
  "6mo": "Últimos 6 meses",
  "1y": "Último ano",
  max: "Todo o período",
};

const TONE_CLASS = { positive: "text-profit", negative: "text-loss" } as const;

function toneClass(tone: "positive" | "negative" | undefined): string {
  return tone ? TONE_CLASS[tone] : "";
}

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
        <div className={`text-2xl font-bold tabular-nums ${toneClass(tone)}`}>
          {value}
        </div>
        {hint && (
          <p className="text-muted-foreground text-xs tabular-nums">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
}

type Snapshot = RouterOutputs["investments"]["getPortfolioSnapshot"];
type Holding = Snapshot["holdings"][number];

function LoadError({
  message,
  isFetching,
  onRetry,
}: {
  message: string;
  isFetching: boolean;
  onRetry: () => void;
}) {
  return (
    <Card className="border-destructive/50 bg-destructive/5">
      <CardContent className="flex flex-col items-start gap-3 py-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-destructive mt-0.5 h-5 w-5 shrink-0" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">Não foi possível carregar este ativo.</p>
            <p className="text-muted-foreground">{message}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          disabled={isFetching}
        >
          {isFetching ? "Tentando..." : "Tentar novamente"}
        </Button>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>
      <Skeleton className="h-96 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function IssuesCard({ issues }: { issues: Snapshot["issues"] }) {
  if (issues.length === 0) return null;
  return (
    <Card className="bg-highlight/50">
      <CardContent className="flex items-start gap-3 py-4">
        <AlertTriangle className="text-foreground mt-0.5 h-5 w-5 shrink-0" />
        <div className="space-y-1 text-sm">
          {issues.map((issue) => (
            <p key={issue.assetName} className="text-muted-foreground">
              {issue.message}
            </p>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function HoldingStats({ holding }: { holding: Holding }) {
  return (
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
  );
}

function ClosedPositionCard({ realizedGain }: { realizedGain: number }) {
  return (
    <Card>
      <CardContent className="py-6">
        <p className="text-muted-foreground">
          Você não tem mais posição neste ativo. O histórico abaixo continua
          disponível.
        </p>
        {realizedGain !== 0 && (
          <p className="mt-1 text-sm">
            Ganho realizado:{" "}
            <span
              className={`font-medium tabular-nums ${gainTone(realizedGain)}`}
            >
              {formatCurrency(realizedGain)}
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AssetDetailBody({
  snapshot,
  assetName,
  state,
}: {
  snapshot: Snapshot | undefined;
  assetName: string;
  state: {
    isPending: boolean;
    isError: boolean;
    error: { message: string } | null;
    isFetching: boolean;
    refetch: () => unknown;
  };
}) {
  if (state.isError && !snapshot) {
    return (
      <LoadError
        message={state.error?.message ?? ""}
        isFetching={state.isFetching}
        onRetry={() => void state.refetch()}
      />
    );
  }
  if (state.isPending || !snapshot) return <LoadingSkeleton />;

  const holding = snapshot.holdings[0];
  return (
    <>
      <IssuesCard issues={snapshot.issues} />

      {holding ? (
        <HoldingStats holding={holding} />
      ) : (
        <ClosedPositionCard realizedGain={snapshot.summary.realizedGain} />
      )}

      <PerformanceChart
        series={snapshot.series}
        title={`Evolução de ${assetName} vs CDI`}
        description="Ganho acumulado no período (incluindo proventos) comparado ao CDI sobre os mesmos aportes neste ativo"
      />

      <TransactionsTable assetName={assetName} />
      <DividendsTable assetName={assetName} />
    </>
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/dashboard/investments"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Investimentos
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="display text-3xl md:text-4xl">
              {holding?.label ?? assetName}
            </h1>
            {holding && (
              <>
                <Badge variant="outline">{holding.assetTypeName}</Badge>
                <PriceStatusBadge holding={holding} />
              </>
            )}
          </div>
          {/* The code stays visible even when a readable name leads: it is
              the identifier the ledger, the provider and the CVM all use. */}
          {holding?.label && (
            <p className="text-muted-foreground font-mono text-xs">
              {assetName}
            </p>
          )}
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

      <AssetDetailBody
        snapshot={snapshot}
        assetName={assetName}
        state={{ isPending, isError, error, isFetching, refetch }}
      />
    </div>
  );
}
