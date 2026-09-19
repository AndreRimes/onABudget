"use client";

import type { ComponentProps } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Label,
  Pie,
  PieChart,
  ReferenceLine,
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
import type { ChartConfig } from "~/components/ui/chart";
import { DonutCenterLabel } from "~/components/ui/donut-center-label";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "~/components/ui/chart";
import { SPEND_COLOR } from "~/lib/chart-colors";

export interface ExpenseChartPoint {
  date: string;
  amount: number;
  formattedDate: string;
  cumulative: number;
}

export interface CategorySlice {
  category: string;
  amount: number;
  fill: string;
}

interface ExpenseChartsProps {
  chartData: ExpenseChartPoint[];
  /** Month mode plots the running total; longer periods plot each month. */
  isDailyChart: boolean;
  monthlyBudget: number;
  categoryChartData: CategorySlice[];
  totalExpenses: number;
}

const areaChartConfig = {
  cumulative: {
    label: "Gasto Acumulado",
    color: SPEND_COLOR,
  },
  amount: {
    label: "Gasto no Mês",
    color: SPEND_COLOR,
  },
  budget: {
    label: "Orçamento",
    color: "var(--destructive)",
  },
} satisfies ChartConfig;

const pieChartConfig = {
  amount: {
    label: "Valor",
  },
} satisfies ChartConfig;

/**
 * The two charts of the Conta Corrente page. Split out of the page so Recharts
 * can be loaded on demand (see ~/components/lazy-charts) and so a keystroke in
 * the search box re-renders the table, not the charts.
 */
/**
 * Tooltip row for a category slice: swatch, name, value and share of the
 * period's total. Kept out of the chart so it is a stable component rather
 * than a formatter recreated on every render.
 */
function CategoryTooltipContent({
  totalExpenses,
  ...props
}: Readonly<
  ComponentProps<typeof ChartTooltipContent> & { totalExpenses: number }
>) {
  return (
    <ChartTooltipContent
      {...props}
      hideLabel
      formatter={(value, _name, item) => {
        // recharts types `item.payload` as `any`; this is the shape
        // `categoryChartData` actually puts in it.
        const slice = item.payload as { fill?: string; category?: string };
        const amount = value as number;
        return (
          <>
            <div className="flex items-center gap-2">
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: slice.fill }}
              />
              <span className="font-medium">{slice.category}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-muted-foreground">Valor:</span>
              <span className="text-foreground font-bold">
                {new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                }).format(amount)}
              </span>
              <span className="text-foreground">
                ({((amount / totalExpenses) * 100).toFixed(1)}%)
              </span>
            </div>
          </>
        );
      }}
    />
  );
}

export function ExpenseCharts({
  chartData,
  isDailyChart,
  monthlyBudget,
  categoryChartData,
  totalExpenses,
}: Readonly<ExpenseChartsProps>) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>
            {isDailyChart ? "Evolução de Gastos" : "Gastos por Mês"}
          </CardTitle>
          <CardDescription>
            {isDailyChart
              ? "Acumulado ao longo do mês"
              : "Total gasto em cada mês do período"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ChartContainer config={areaChartConfig} className="h-87.5 w-full">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient
                    id="fillCumulative"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={SPEND_COLOR}
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor={SPEND_COLOR}
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="formattedDate"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={32}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(value: number) =>
                    new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                      minimumFractionDigits: 0,
                    }).format(value)
                  }
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      indicator="line"
                      labelFormatter={(value, payload) => {
                        const entry = payload?.[0]?.payload as
                          | { date?: string }
                          | undefined;
                        const date = entry?.date;
                        if (!date) return String(value);
                        return isDailyChart
                          ? format(parseISO(date), "dd/MM/yyyy", {
                              locale: ptBR,
                            })
                          : format(parseISO(`${date}-01`), "MMMM 'de' yyyy", {
                              locale: ptBR,
                            });
                      }}
                      formatter={(value) =>
                        new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        }).format(value as number)
                      }
                    />
                  }
                />
                <Area
                  dataKey={isDailyChart ? "cumulative" : "amount"}
                  type="monotone"
                  fill="url(#fillCumulative)"
                  stroke={SPEND_COLOR}
                  strokeWidth={2}
                />
                {/* Always the monthly figure: in month mode the cumulative
                  line is compared against it, in multi-month mode each
                  month's own total is. */}
                {monthlyBudget > 0 && (
                  <ReferenceLine
                    y={monthlyBudget}
                    stroke="var(--destructive)"
                    strokeDasharray="6 4"
                    strokeWidth={2}
                  >
                    <Label
                      value={`Orçamento: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(monthlyBudget)}`}
                      position="insideTopRight"
                      className="fill-destructive text-xs font-medium"
                    />
                  </ReferenceLine>
                )}
              </AreaChart>
            </ChartContainer>
          ) : (
            <div className="text-muted-foreground flex h-87.5 items-center justify-center">
              Nenhum dado disponível para o período selecionado
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gastos por Categoria</CardTitle>
          <CardDescription>
            Distribuição de gastos por categoria
          </CardDescription>
        </CardHeader>
        <CardContent>
          {categoryChartData.length > 0 ? (
            <ChartContainer config={pieChartConfig} className="h-87.5 w-full">
              <PieChart>
                <ChartTooltip
                  cursor={false}
                  content={
                    <CategoryTooltipContent totalExpenses={totalExpenses} />
                  }
                />
                <Pie
                  data={categoryChartData}
                  dataKey="amount"
                  nameKey="category"
                  innerRadius={70}
                  strokeWidth={5}
                >
                  <Label
                    content={
                      <DonutCenterLabel
                        // Whole reais only: the cents pushed the total wider
                        // than the hole and it spilled over the ring.
                        primary={new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                          maximumFractionDigits: 0,
                        }).format(totalExpenses)}
                        secondary="Total"
                        primaryClassName="fill-foreground text-2xl font-bold"
                        primaryOffset={-6}
                        secondaryOffset={18}
                      />
                    }
                  />
                </Pie>
              </PieChart>
            </ChartContainer>
          ) : (
            <div className="text-muted-foreground flex h-87.5 items-center justify-center">
              Nenhum dado disponível para o período selecionado
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
