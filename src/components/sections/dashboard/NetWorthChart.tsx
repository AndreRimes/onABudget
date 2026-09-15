"use client";

import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Area,
  AreaChart,
  CartesianGrid,
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
import { CASH_COLOR, INVESTMENT_COLOR } from "~/lib/chart-colors";
import type { NetWorthPoint } from "~/server/api/accounts/net-worth";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

/** Compact currency for axis ticks — full BRL strings collide at this size. */
function formatAxisCurrency(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return value.toFixed(0);
}

/** Square, hard-bordered swatch — same block vocabulary as the rest of the UI. */
function SeriesSwatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="border-foreground inline-block size-3 border-2"
      style={{ backgroundColor: color }}
    />
  );
}

interface TooltipPayloadEntry {
  dataKey?: string | number;
  value?: number;
}

function NetWorthTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  // recharts types these as `any`; this is the shape the series above put in.
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload?.length || !label) return null;

  const valueOf = (key: string) =>
    payload.find((entry) => entry.dataKey === key)?.value ?? 0;
  const cash = valueOf("cash");
  const investments = valueOf("investments");

  return (
    <div className="border-foreground bg-card grid gap-1 border-2 p-2 text-xs">
      <p className="font-bold">
        {format(parseISO(label), "dd MMM yyyy", { locale: ptBR })}
      </p>
      <p>Conta: {formatCurrency(cash)}</p>
      <p>Investimentos: {formatCurrency(investments)}</p>
      <p className="font-bold">Total: {formatCurrency(cash + investments)}</p>
    </div>
  );
}

/**
 * Cash and portfolio value stacked into one net-worth line.
 *
 * The two halves are not equally knowable, and the empty state says so: the
 * portfolio side is replayed from the ledger and reaches as far back as the
 * first trade, while cash balances are only ever *observed*, so their history
 * starts the first time a balance was recorded and grows from there.
 */
interface NetWorthChartProps {
  /** Undefined while the dashboard's overview query is still loading. */
  data: { points: NetWorthPoint[]; cashFrom: string | null } | undefined;
}

export function NetWorthChart({ data }: NetWorthChartProps) {
  // Fed by the page rather than fetching for itself: the series comes out of
  // the same portfolio replay the summary cards need, so one query serves both.
  const isLoading = data === undefined;
  const points = data?.points ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Patrimônio</CardTitle>
        <CardDescription>
          Conta corrente e investimentos · últimos 12 meses
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-muted-foreground flex h-64 items-center justify-center">
            Carregando...
          </div>
        ) : points.length === 0 ? (
          <div className="text-muted-foreground flex h-64 items-center justify-center text-center text-sm">
            Sem dados suficientes ainda.
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={256}>
              <AreaChart data={points}>
                <defs>
                  <linearGradient id="netWorthCash" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor={CASH_COLOR}
                      stopOpacity={0.4}
                    />
                    <stop
                      offset="100%"
                      stopColor={CASH_COLOR}
                      stopOpacity={0.08}
                    />
                  </linearGradient>
                  <linearGradient
                    id="netWorthInvestments"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={INVESTMENT_COLOR}
                      stopOpacity={0.35}
                    />
                    <stop
                      offset="100%"
                      stopColor={INVESTMENT_COLOR}
                      stopOpacity={0.05}
                    />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--border)"
                />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={32}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  tickFormatter={(value: string) =>
                    format(parseISO(value), "dd/MM")
                  }
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  width={56}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  tickFormatter={formatAxisCurrency}
                />
                <Tooltip
                  cursor={{
                    stroke: "var(--muted-foreground)",
                    strokeDasharray: "4 4",
                  }}
                  content={<NetWorthTooltip />}
                />
                <Area
                  type="monotone"
                  dataKey="investments"
                  stackId="networth"
                  stroke={INVESTMENT_COLOR}
                  fill="url(#netWorthInvestments)"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="cash"
                  stackId="networth"
                  stroke={CASH_COLOR}
                  fill="url(#netWorthCash)"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>

            {/* Legend: the two bands are told apart by label, not colour alone. */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
              <span className="flex items-center gap-1.5 font-medium">
                <SeriesSwatch color={CASH_COLOR} />
                Conta corrente
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                <SeriesSwatch color={INVESTMENT_COLOR} />
                Investimentos
              </span>
            </div>

            {data?.cashFrom ? (
              <p className="text-muted-foreground mt-2 font-mono text-xs">
                Saldo em conta registrado desde{" "}
                {format(parseISO(data.cashFrom), "dd/MM/yyyy")}; antes disso o
                gráfico mostra apenas investimentos.
              </p>
            ) : (
              <p className="text-muted-foreground mt-2 font-mono text-xs">
                O histórico de saldo em conta começa hoje — ele é registrado a
                cada atualização, não reconstruído para trás.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
