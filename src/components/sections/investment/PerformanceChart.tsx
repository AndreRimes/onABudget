"use client";

import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { cn } from "~/lib/utils";
import {
  BENCHMARKS,
  BENCHMARK_ORDER,
  DEFAULT_BENCHMARKS,
  type BenchmarkId,
} from "~/server/api/investments/benchmarks";
import type { RouterOutputs } from "~/trpc/react";
import { formatCurrency, formatPercent } from "./format";

type Snapshot = RouterOutputs["investments"]["getPortfolioSnapshot"];

const PORTFOLIO_COLOR = "var(--chart-portfolio)";

/** Compact currency for axis ticks — full BRL strings collide at this size. */
function formatAxisCurrency(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return value.toFixed(0);
}

function SeriesSwatch({ color, dash }: { color: string; dash: string }) {
  return (
    <svg width="16" height="8" aria-hidden className="shrink-0">
      <line
        x1="0"
        y1="4"
        x2="16"
        y2="4"
        stroke={color}
        strokeWidth={2.5}
        strokeDasharray={dash || undefined}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PerformanceChart({
  series,
  title = "Evolução da Carteira",
  description = "Ganho acumulado no período, incluindo proventos, comparado a índices sobre os mesmos aportes",
}: {
  series: Snapshot["series"];
  title?: string;
  description?: string;
}) {
  const [active, setActive] = useState<BenchmarkId[]>(DEFAULT_BENCHMARKS);

  // Only offer benchmarks the server actually returned data for — a provider
  // outage drops the line rather than showing a dead toggle.
  const available = useMemo(() => {
    const first = series[0];
    if (!first) return [] as BenchmarkId[];
    return BENCHMARK_ORDER.filter((id) => id in first.benchmarkGains);
  }, [series]);

  const visible = active.filter((id) => available.includes(id));

  const chartData = useMemo(
    () =>
      series.map((point) => {
        const row: Record<string, number | string> = {
          date: point.date,
          label: format(parseISO(point.date), "dd/MM/yy", { locale: ptBR }),
          value: point.value,
          invested: point.invested,
          gain: point.gain,
          dividendsAccumulated: point.dividendsAccumulated,
        };
        for (const id of BENCHMARK_ORDER) {
          const gain = point.benchmarkGains[id];
          if (gain !== undefined) row[id] = gain;
        }
        return row;
      }),
    [series],
  );

  const toggle = (id: BenchmarkId) =>
    setActive((current) =>
      current.includes(id)
        ? current.filter((other) => other !== id)
        : [...current, id],
    );

  return (
    <Card>
      <CardHeader className="gap-3">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>

        {available.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Índices para comparação"
          >
            <span className="mr-1 text-xs text-muted-foreground">
              Comparar com:
            </span>
            {available.map((id) => {
              const benchmark = BENCHMARKS[id];
              const isOn = visible.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggle(id)}
                  aria-pressed={isOn}
                  title={benchmark.description}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    isOn
                      ? "border-transparent bg-accent text-accent-foreground"
                      : "border-border text-muted-foreground hover:bg-accent/50",
                  )}
                >
                  <SeriesSwatch
                    color={isOn ? benchmark.colorVar : "currentColor"}
                    dash={benchmark.dash}
                  />
                  {benchmark.label}
                </button>
              );
            })}
          </div>
        )}
      </CardHeader>

      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex h-80 items-center justify-center">
            <p className="text-muted-foreground">
              Nenhum dado disponível para o período selecionado
            </p>
          </div>
        ) : (
          <>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="portfolioFill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor={PORTFOLIO_COLOR}
                        stopOpacity={0.35}
                      />
                      <stop
                        offset="100%"
                        stopColor={PORTFOLIO_COLOR}
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="var(--border)"
                  />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={32}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    width={56}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                    tickFormatter={formatAxisCurrency}
                  />
                  {/* Gains are anchored to 0 at the range start, so the zero
                      line is the actual break-even reference. */}
                  <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />

                  <Tooltip
                    cursor={{
                      stroke: "var(--muted-foreground)",
                      strokeDasharray: "4 4",
                    }}
                    content={({ active: isActive, payload }) => {
                      if (!isActive || !payload?.length) return null;
                      const row = payload[0]?.payload as
                        | (typeof chartData)[number]
                        | undefined;
                      if (!row) return null;

                      const invested = Number(row.invested);
                      const pct = (amount: number) =>
                        invested > 0 ? (amount / invested) * 100 : 0;
                      const gain = Number(row.gain);

                      return (
                        <div className="min-w-56 rounded-lg border bg-popover p-3 text-sm shadow-md">
                          <p className="mb-2 font-medium text-muted-foreground">
                            {String(row.label)}
                          </p>

                          <div className="space-y-1.5">
                            {/* Identity is name + swatch, never colour alone. */}
                            <div className="flex items-center justify-between gap-4">
                              <span className="flex items-center gap-1.5">
                                <SeriesSwatch
                                  color={PORTFOLIO_COLOR}
                                  dash=""
                                />
                                Carteira
                              </span>
                              <span className="font-semibold tabular-nums">
                                {formatCurrency(gain)}
                                <span className="ml-1 text-xs text-muted-foreground">
                                  ({formatPercent(pct(gain))})
                                </span>
                              </span>
                            </div>

                            {visible.map((id) => {
                              const amount = Number(row[id] ?? 0);
                              return (
                                <div
                                  key={id}
                                  className="flex items-center justify-between gap-4"
                                >
                                  <span className="flex items-center gap-1.5 text-muted-foreground">
                                    <SeriesSwatch
                                      color={BENCHMARKS[id].colorVar}
                                      dash={BENCHMARKS[id].dash}
                                    />
                                    {BENCHMARKS[id].label}
                                  </span>
                                  <span className="tabular-nums">
                                    {formatCurrency(amount)}
                                    <span className="ml-1 text-xs text-muted-foreground">
                                      ({formatPercent(pct(amount))})
                                    </span>
                                  </span>
                                </div>
                              );
                            })}
                          </div>

                          <div className="mt-2 space-y-1 border-t pt-2 text-xs text-muted-foreground">
                            <div className="flex justify-between gap-4">
                              <span>Patrimônio</span>
                              <span className="tabular-nums">
                                {formatCurrency(Number(row.value))}
                              </span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span>Total investido</span>
                              <span className="tabular-nums">
                                {formatCurrency(invested)}
                              </span>
                            </div>
                            {Number(row.dividendsAccumulated) > 0 && (
                              <div className="flex justify-between gap-4">
                                <span>Proventos no período</span>
                                <span className="tabular-nums">
                                  {formatCurrency(
                                    Number(row.dividendsAccumulated),
                                  )}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }}
                  />

                  {/* Benchmarks first so the portfolio's filled area draws on
                      top and stays the dominant mark. */}
                  {visible.map((id) => (
                    <Line
                      key={id}
                      type="monotone"
                      dataKey={id}
                      stroke={BENCHMARKS[id].colorVar}
                      strokeWidth={2}
                      strokeDasharray={BENCHMARKS[id].dash || undefined}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                      isAnimationActive={false}
                    />
                  ))}

                  <Area
                    type="monotone"
                    dataKey="gain"
                    stroke={PORTFOLIO_COLOR}
                    strokeWidth={2.5}
                    fill="url(#portfolioFill)"
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Legend is always present for >= 2 series, so identity never
                rests on colour alone. */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
              <span className="flex items-center gap-1.5 font-medium">
                <SeriesSwatch color={PORTFOLIO_COLOR} dash="" />
                Carteira
              </span>
              {visible.map((id) => (
                <span
                  key={id}
                  className="flex items-center gap-1.5 text-muted-foreground"
                >
                  <SeriesSwatch
                    color={BENCHMARKS[id].colorVar}
                    dash={BENCHMARKS[id].dash}
                  />
                  {BENCHMARKS[id].label}
                </span>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
