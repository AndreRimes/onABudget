"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { ChartContainer, ChartTooltip } from "~/components/ui/chart";
import type { RouterOutputs } from "~/trpc/react";
import { formatCurrency, formatPercent } from "./format";

type Snapshot = RouterOutputs["investments"]["getPortfolioSnapshot"];

const SLICE_COLORS = [
  "var(--chart-2)",
  "var(--chart-1)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function AllocationDonut({
  holdings,
  totalValue,
}: {
  holdings: Snapshot["holdings"];
  totalValue: number;
}) {
  const data = useMemo(() => {
    const byType = new Map<string, number>();
    for (const holding of holdings) {
      byType.set(
        holding.assetTypeName,
        (byType.get(holding.assetTypeName) ?? 0) + holding.currentValue,
      );
    }
    return [...byType.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [holdings]);

  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alocação</CardTitle>
        <CardDescription>Distribuição por tipo de ativo</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={{}} className="mx-auto aspect-square max-h-56">
          <PieChart>
            <ChartTooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const entry = payload[0]?.payload as
                  | { name: string; value: number }
                  | undefined;
                if (!entry) return null;
                return (
                  <div className="rounded-lg border bg-background p-2 text-sm shadow-md">
                    <p className="font-medium">{entry.name}</p>
                    <p>
                      {formatCurrency(entry.value)}
                      {totalValue > 0 &&
                        ` (${formatPercent((entry.value / totalValue) * 100)})`}
                    </p>
                  </div>
                );
              }}
            />
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="55%"
              outerRadius="85%"
              strokeWidth={2}
              stroke="var(--background)"
            >
              {data.map((entry, index) => (
                <Cell
                  key={entry.name}
                  fill={SLICE_COLORS[index % SLICE_COLORS.length]}
                />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="mt-2 space-y-1">
          {data.map((entry, index) => (
            <div
              key={entry.name}
              className="flex items-center justify-between text-sm"
            >
              <span className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor: SLICE_COLORS[index % SLICE_COLORS.length],
                  }}
                />
                {entry.name}
              </span>
              <span className="text-muted-foreground">
                {totalValue > 0
                  ? formatPercent((entry.value / totalValue) * 100)
                  : "—"}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
