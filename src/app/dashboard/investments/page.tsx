"use client";

import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import type { ChartConfig } from "~/components/ui/chart";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "~/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";
import { CreateInvestmentDialog } from "~/components/sections/investment/CreateInvestmentDialog";
import { CreateAssetTypeDialog } from "~/components/sections/asset-type/CreateAssetTypeDialog";
import { toast } from "sonner";

type TimeRange = "1d" | "5d" | "1mo" | "6mo" | "1y" | "max";

type Holding = {
  assetName: string;
  quantity: number;
  averageCost: number;
  currentPrice: number;
  currentValue: number;
  totalCost: number;
  unrealizedGain: number;
  unrealizedGainPercent: number;
  periodGain: number;
  periodGainPercent: number;
  isFixedIncome: boolean;
  fixedIncomeYieldType: string | null;
  fixedIncomeRate: number | null;
  fixedIncomeMaturityDate: string | null;
};

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

  // Fetch portfolio data with market prices (filtered by time range)
  const { data: portfolio, isLoading: isLoadingPortfolio } =
    api.investments.getPortfolioWithMarketData.useQuery({ range: timeRange });

  // Fetch asset types
  const { data: assetTypes } = api.assetTypes.getAll.useQuery();

  // Fetch portfolio performance for chart
  const { data: performanceData, isLoading: isLoadingPerformance } =
    api.investments.getPortfolioPerformance.useQuery({
      range: timeRange === "max" ? "max" : timeRange,
    });

  // Create asset type map
  const assetTypeMap = useMemo(() => {
    const map = new Map<number, string>();
    assetTypes?.forEach((type) => map.set(type.id, type.name));
    return map;
  }, [assetTypes]);

  // Fetch all transactions to get asset type info
  const { data: transactions } = api.investments.getAllFromUser.useQuery({});

  // Create a map of asset name to asset type id
  const assetToTypeMap = useMemo(() => {
    const map = new Map<string, number>();
    transactions?.forEach((t) => map.set(t.assetName, t.assetTypeId));
    return map;
  }, [transactions]);

  // Create a map of asset name to transaction IDs for deletion
  const assetToTransactionsMap = useMemo(() => {
    const map = new Map<string, number[]>();
    transactions?.forEach((t) => {
      if (!map.has(t.assetName)) {
        map.set(t.assetName, []);
      }
      map.get(t.assetName)!.push(t.id);
    });
    return map;
  }, [transactions]);

  const utils = api.useUtils();

  const { mutate: deleteInvestment, isPending: isDeleting } = api.investments.delete.useMutation({
    onSuccess: () => {
      utils.investments.getAllFromUser.invalidate();
      utils.investments.getPortfolioWithMarketData.invalidate();
      utils.investments.getPortfolioHoldings.invalidate();
      utils.investments.getPortfolioPerformance.invalidate();
      toast.success("Transação excluída com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao excluir transação: " + error.message);
    },
  });

  const handleDeleteAsset = (assetName: string) => {
    const transactionIds = assetToTransactionsMap.get(assetName);
    if (!transactionIds || transactionIds.length === 0) {
      toast.error("Nenhuma transação encontrada para este ativo");
      return;
    }

    if (confirm(`Deseja realmente excluir todas as ${transactionIds.length} transação(ões) de ${assetName}?`)) {
      transactionIds.forEach((id) => {
        deleteInvestment({ id });
      });
    }
  };

  // Group holdings by asset type
  const holdingsByAssetType = useMemo(() => {
    if (!portfolio?.holdings) return new Map<string, Holding[]>();

    const grouped = new Map<string, Holding[]>();

    portfolio.holdings.forEach((holding: Holding) => {
      const assetTypeId = assetToTypeMap.get(holding.assetName);
      const assetTypeName = assetTypeId
        ? assetTypeMap.get(assetTypeId) || "Outros"
        : "Outros";

      if (!grouped.has(assetTypeName)) {
        grouped.set(assetTypeName, []);
      }
      grouped.get(assetTypeName)!.push(holding);
    });

    return grouped;
  }, [portfolio?.holdings, assetToTypeMap, assetTypeMap]);

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!performanceData?.dates?.length) return [];

    return performanceData.dates.map((date: string, index: number) => {
      const totalCost = performanceData.totalCost[index] || 0;
      const gainLoss = performanceData.gainLoss[index] || 0;
      const cdiValue = performanceData.cdiValue[index] || 0;
      const cdiGain = cdiValue - totalCost;
      
      return {
        date,
        formattedDate: format(parseISO(date), "dd/MM/yy", { locale: ptBR }),
        portfolioValue: performanceData.portfolioValue[index] || 0,
        totalCost,
        gainLoss,
        gainLossPercent:
          totalCost > 0
            ? ((gainLoss / totalCost) * 100)
            : 0,
        cdiValue,
        cdiGain,
        cdiGainPercent:
          totalCost > 0
            ? ((cdiGain / totalCost) * 100)
            : 0,
      };
    });
  }, [performanceData]);

  const periodSummary = useMemo(() => {
    if (!portfolio?.holdings?.length) return null;
    const periodGain = portfolio.holdings.reduce(
      (sum: number, h: Holding) => sum + h.periodGain,
      0,
    );
    const startValue = portfolio.holdings.reduce(
      (sum: number, h: Holding) => sum + (h.currentValue - h.periodGain),
      0,
    );
    const periodGainPercent =
      startValue > 0 ? (periodGain / startValue) * 100 : 0;
    return { periodGain, periodGainPercent };
  }, [portfolio?.holdings]);

  const chartConfig = {
    gainLoss: {
      label: "Portfólio",
      color: "hsl(var(--primary))",
    },
    cdiGain: {
      label: "CDI",
      color: "#fb923c",
    },
  } satisfies ChartConfig;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "percent",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value / 100);
  };


  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Investimentos</h1>

        <div className="flex gap-3">
          <CreateAssetTypeDialog />
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

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoadingPortfolio ? (
                <span className="text-muted-foreground">Carregando...</span>
              ) : (
                formatCurrency(portfolio?.totalValue || 0)
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Investido</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoadingPortfolio ? (
                <span className="text-muted-foreground">Carregando...</span>
              ) : (
                formatCurrency(portfolio?.totalCost || 0)
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ganho/Perda no Período</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold flex items-center gap-2 ${
                (periodSummary?.periodGain ?? 0) >= 0
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              {isLoadingPortfolio ? (
                <span className="text-muted-foreground">Carregando...</span>
              ) : (
                <>
                  {(periodSummary?.periodGain ?? 0) >= 0 ? (
                    <TrendingUp className="h-5 w-5" />
                  ) : (
                    <TrendingDown className="h-5 w-5" />
                  )}
                  {formatCurrency(periodSummary?.periodGain ?? 0)}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rentabilidade no Período</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                (periodSummary?.periodGainPercent ?? 0) >= 0
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              {isLoadingPortfolio ? (
                <span className="text-muted-foreground">Carregando...</span>
              ) : (
                formatPercent(periodSummary?.periodGainPercent ?? 0)
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Evolução do Portfólio vs CDI</CardTitle>
          <CardDescription>
            Comparação do ganho/perda acumulado com o CDI
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingPerformance ? (
            <div className="flex h-88 items-center justify-center">
              <p className="text-muted-foreground">Carregando gráfico...</p>
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex h-88 items-center justify-center">
              <p className="text-muted-foreground">
                Nenhum dado disponível para o período selecionado
              </p>
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-88 w-full">
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="gainGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="#7f22fe"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor="#7f22fe"
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                  <linearGradient id="cdiGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="#fb923c"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor="#fb923c"
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="formattedDate"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(value) => formatCurrency(value)}
                />
                <ChartTooltip
                  cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "5 5" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const data = payload[0]?.payload;
                    if (!data) return null;
                    return (
                      <div className="rounded-lg border bg-background p-3 shadow-md text-sm flex flex-col gap-2">
                        <p className="font-medium text-muted-foreground">{data.formattedDate}</p>
                        <div className="border-b pb-2">
                          <div className="flex items-center justify-between gap-4">
                            <span className="font-semibold text-[#7f22fe]">Portfólio</span>
                          </div>
                          <div className="flex items-center justify-between gap-4 mt-1">
                            <span className="text-xs text-muted-foreground">Ganho/Perda:</span>
                            <span className={`font-bold ${data.gainLoss >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {formatCurrency(data.gainLoss)} ({formatPercent(data.gainLossPercent)})
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-xs text-muted-foreground">Valor:</span>
                            <span className="font-bold">{formatCurrency(data.portfolioValue)}</span>
                          </div>
                        </div>

                        <div className="pb-1">
                          <div className="flex items-center justify-between gap-4">
                            <span className="font-semibold text-[#fb923c]">CDI</span>
                          </div>
                          <div className="flex items-center justify-between gap-4 mt-1">
                            <span className="text-xs text-muted-foreground">Ganho:</span>
                            <span className={`font-bold ${data.cdiGain >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {formatCurrency(data.cdiGain)} ({formatPercent(data.cdiGainPercent)})
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-xs text-muted-foreground">Valor:</span>
                            <span className="font-bold">{formatCurrency(data.cdiValue)}</span>
                          </div>
                        </div>

                        <div className="border-t pt-2">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-xs text-muted-foreground">Total Investido:</span>
                            <span className="font-bold">{formatCurrency(data.totalCost)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="cdiGain"
                  stroke="#fb923c"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#cdiGradient)"
                />
                <Area
                  type="monotone"
                  dataKey="gainLoss"
                  stroke="#7f22fe"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#gainGradient)"
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Holdings by Asset Type */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Investimentos por Tipo de Ativo</h2>

        {isLoadingPortfolio ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-muted-foreground">
                Carregando investimentos...
              </p>
            </CardContent>
          </Card>
        ) : holdingsByAssetType.size === 0 ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-muted-foreground">
                Nenhum investimento encontrado
              </p>
            </CardContent>
          </Card>
        ) : (
          Array.from(holdingsByAssetType.entries()).map(
            ([assetTypeName, holdings]) => {
              const groupTotal = holdings.reduce(
                (sum: number, h: Holding) => sum + h.currentValue,
                0
              );
              const groupGain = holdings.reduce((sum: number, h: Holding) => sum + h.periodGain, 0);
              const groupGainBase = holdings.reduce(
                (sum: number, h: Holding) => sum + (h.currentValue - h.periodGain),
                0
              );
              const groupGainPercent =
                groupGainBase > 0 ? (groupGain / groupGainBase) * 100 : 0;

              return (
                <Card key={assetTypeName}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>{assetTypeName}</CardTitle>
                        <CardDescription>
                          {holdings.length} ativo
                          {holdings.length !== 1 ? "s" : ""}
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
                          {formatCurrency(groupGain)} (
                          {formatPercent(groupGainPercent)})
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
                          <TableHead className="text-right">Ganho/Perda</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {holdings.map((holding: Holding) => (
                          <TableRow key={holding.assetName}>
                            <TableCell className="font-medium">
                              <div className="flex flex-col gap-1">
                                {holding.assetName}
                                {holding.isFixedIncome && (
                                  <div className="flex items-center gap-1">
                                    <Badge variant="secondary" className="text-xs">
                                      {holding.fixedIncomeYieldType === "CDI_PERCENTAGE"
                                        ? `${holding.fixedIncomeRate}% CDI`
                                        : `${holding.fixedIncomeRate}% a.a.`}
                                    </Badge>
                                    {holding.fixedIncomeMaturityDate && (
                                      <span className="text-xs text-muted-foreground">
                                        Venc: {format(parseISO(holding.fixedIncomeMaturityDate), "dd/MM/yyyy")}
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
                              <div className="flex flex-col items-end gap-1">
                                <span
                                  className={`font-medium ${
                                    holding.unrealizedGain >= 0
                                      ? "text-green-600"
                                      : "text-red-600"
                                  }`}
                                >
                                  {holding.unrealizedGain >= 0 ? "+" : ""}
                                  {formatCurrency(holding.unrealizedGain)}
                                </span>
                                <Badge
                                  variant={
                                    holding.unrealizedGainPercent >= 0
                                      ? "default"
                                      : "destructive"
                                  }
                                  className="text-xs"
                                >
                                  {holding.unrealizedGainPercent >= 0 ? "+" : ""}
                                  {formatPercent(holding.unrealizedGainPercent)}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDeleteAsset(holding.assetName)}
                                disabled={isDeleting}
                              >
                                Excluir
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              );
            }
          )
        )}
      </div>
    </div>
  );
}