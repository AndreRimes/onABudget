"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Label,
  Pie,
  PieChart,
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
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "~/components/ui/chart";
import { SPEND_COLOR } from "~/lib/chart-colors";
import { formatCurrency } from "~/lib/format";

interface DashboardExpenseChartsProps {
  monthlyChartData: Array<{ month: string; amount: number }>;
  categoryChartData: Array<{ category: string; amount: number; fill: string }>;
  /** This month's total, printed in the middle of the category donut. */
  monthlySpend: number;
  /** "setembro 2026" — the month the donut describes. */
  monthLabel: string;
}

const barChartConfig = {
  amount: {
    label: "Gastos",
    color: SPEND_COLOR,
  },
} satisfies ChartConfig;

const pieChartConfig = {
  amount: {
    label: "Valor",
  },
} satisfies ChartConfig;

/**
 * The dashboard's two expense charts. Split out of the page so Recharts can be
 * loaded on demand (see ~/components/lazy-charts).
 */
export function DashboardExpenseCharts({
  monthlyChartData,
  categoryChartData,
  monthlySpend,
  monthLabel,
}: DashboardExpenseChartsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Spending Trend - Last 12 Months */}
      <Card>
        <CardHeader>
          <CardTitle>Evolução de Gastos</CardTitle>
          <CardDescription>Últimos 12 meses</CardDescription>
        </CardHeader>
        <CardContent>
          {monthlyChartData.length === 0 ? (
            <div className="text-muted-foreground flex h-64 items-center justify-center">
              Sem dados
            </div>
          ) : (
            <ChartContainer config={barChartConfig} className="h-64 w-full">
              <BarChart data={monthlyChartData} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) =>
                    new Intl.NumberFormat("pt-BR", {
                      notation: "compact",
                      compactDisplay: "short",
                    }).format(v)
                  }
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => formatCurrency(Number(value))}
                    />
                  }
                />
                {/* Square bars with an ink outline — same block vocabulary
                  as the cards around them. */}
                <Bar
                  dataKey="amount"
                  fill={SPEND_COLOR}
                  stroke="var(--foreground)"
                  strokeWidth={2}
                  radius={0}
                />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Category Breakdown - Current Month */}
      <Card>
        <CardHeader>
          <CardTitle>Gastos por Categoria</CardTitle>
          <CardDescription>{monthLabel}</CardDescription>
        </CardHeader>
        <CardContent>
          {categoryChartData.length === 0 ? (
            <div className="text-muted-foreground flex h-64 items-center justify-center">
              Sem dados
            </div>
          ) : (
            <ChartContainer
              config={pieChartConfig}
              className="mx-auto h-64 w-full"
            >
              <PieChart>
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => formatCurrency(Number(value))}
                    />
                  }
                />
                <Pie
                  data={categoryChartData}
                  dataKey="amount"
                  nameKey="category"
                  innerRadius={60}
                  strokeWidth={2}
                >
                  <Label
                    content={({ viewBox }) => {
                      if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                        return (
                          <text
                            x={viewBox.cx}
                            y={viewBox.cy}
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            <tspan
                              x={viewBox.cx}
                              y={viewBox.cy}
                              className="fill-foreground text-lg font-bold"
                            >
                              {formatCurrency(monthlySpend)}
                            </tspan>
                            <tspan
                              x={viewBox.cx}
                              y={(viewBox.cy ?? 0) + 20}
                              className="fill-muted-foreground text-xs"
                            >
                              Total
                            </tspan>
                          </text>
                        );
                      }
                    }}
                  />
                </Pie>
              </PieChart>
            </ChartContainer>
          )}
          {/* Category legend */}
          {categoryChartData.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {categoryChartData.map((item) => (
                <div
                  key={item.category}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="border-foreground size-3 border-2"
                      style={{ backgroundColor: item.fill }}
                    />
                    <span className="text-muted-foreground truncate">
                      {item.category}
                    </span>
                  </div>
                  <span className="font-medium">
                    {formatCurrency(item.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
