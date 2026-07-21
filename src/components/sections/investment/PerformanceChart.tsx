"use client";

import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import type { ChartConfig } from "~/components/ui/chart";
import { ChartContainer, ChartTooltip } from "~/components/ui/chart";
import type { RouterOutputs } from "~/trpc/react";
import { formatCurrency, formatPercent } from "./format";

type Snapshot = RouterOutputs["investments"]["getPortfolioSnapshot"];

const chartConfig = {
  gain: {
    label: "Portfólio",
    color: "var(--chart-2)",
  },
  cdiGain: {
    label: "CDI",
    color: "#fb923c",
  },
} satisfies ChartConfig;

export function PerformanceChart({ series }: { series: Snapshot["series"] }) {
  const chartData = useMemo(
    () =>
      series.map((point) => ({
        ...point,
        formattedDate: format(parseISO(point.date), "dd/MM/yy", {
          locale: ptBR,
        }),
        gainPercent:
          point.invested > 0 ? (point.gain / point.invested) * 100 : 0,
        cdiGainPercent:
          point.invested > 0 ? (point.cdiGain / point.invested) * 100 : 0,
      })),
    [series],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Evolução do Portfólio vs CDI</CardTitle>
        <CardDescription>
          Ganho acumulado no período (incluindo proventos) comparado ao CDI
          sobre os mesmos aportes
        </CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
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
                    stopColor="var(--color-gain)"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-gain)"
                    stopOpacity={0.1}
                  />
                </linearGradient>
                <linearGradient id="cdiGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-cdiGain)"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-cdiGain)"
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
                tickFormatter={(value: number) => formatCurrency(value)}
              />
              <ChartTooltip
                cursor={{
                  stroke: "var(--muted-foreground)",
                  strokeDasharray: "5 5",
                }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const data = payload[0]?.payload as
                    | (typeof chartData)[number]
                    | undefined;
                  if (!data) return null;
                  return (
                    <div className="flex flex-col gap-2 rounded-lg border bg-background p-3 text-sm shadow-md">
                      <p className="font-medium text-muted-foreground">
                        {data.formattedDate}
                      </p>
                      <div className="border-b pb-2">
                        <span className="font-semibold text-[var(--chart-2)]">
                          Portfólio
                        </span>
                        <div className="mt-1 flex items-center justify-between gap-4">
                          <span className="text-xs text-muted-foreground">
                            Ganho no período:
                          </span>
                          <span
                            className={`font-bold ${
                              data.gain >= 0 ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {formatCurrency(data.gain)} (
                            {formatPercent(data.gainPercent)})
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-xs text-muted-foreground">
                            Valor:
                          </span>
                          <span className="font-bold">
                            {formatCurrency(data.value)}
                          </span>
                        </div>
                        {data.dividendsAccumulated > 0 && (
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-xs text-muted-foreground">
                              Proventos no período:
                            </span>
                            <span className="font-bold">
                              {formatCurrency(data.dividendsAccumulated)}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="pb-1">
                        <span className="font-semibold text-[#fb923c]">CDI</span>
                        <div className="mt-1 flex items-center justify-between gap-4">
                          <span className="text-xs text-muted-foreground">
                            Ganho no período:
                          </span>
                          <span
                            className={`font-bold ${
                              data.cdiGain >= 0
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {formatCurrency(data.cdiGain)} (
                            {formatPercent(data.cdiGainPercent)})
                          </span>
                        </div>
                      </div>
                      <div className="border-t pt-2">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-xs text-muted-foreground">
                            Total Investido:
                          </span>
                          <span className="font-bold">
                            {formatCurrency(data.invested)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="cdiGain"
                stroke="var(--color-cdiGain)"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#cdiGradient)"
              />
              <Area
                type="monotone"
                dataKey="gain"
                stroke="var(--color-gain)"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#gainGradient)"
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
