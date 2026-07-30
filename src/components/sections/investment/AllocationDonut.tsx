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

// Every slice touches every other one in a donut, so this uses exactly the four
// slots validated for all-pairs separation — and nothing beyond them. A fifth
// hue would not clear the floors, so the tail folds into "Outros" instead of
// cycling the palette.
const SLICE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
];
const OTHER_COLOR = "var(--muted-foreground)";
const MAX_SLICES = SLICE_COLORS.length;

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
    const sorted = [...byType.entries()]
      .map(([name, value]) => ({ name, value, color: OTHER_COLOR }))
      .sort((a, b) => b.value - a.value);

    if (sorted.length <= MAX_SLICES) {
      return sorted.map((slice, index) => ({
        ...slice,
        color: SLICE_COLORS[index]!,
      }));
    }

    // Keep the largest three named and roll the rest up, so the palette never
    // has to invent a colour it was not validated for.
    const head = sorted.slice(0, MAX_SLICES - 1).map((slice, index) => ({
      ...slice,
      color: SLICE_COLORS[index]!,
    }));
    const tail = sorted.slice(MAX_SLICES - 1);
    return [
      ...head,
      {
        name: `Outros (${tail.length})`,
        value: tail.reduce((sum, slice) => sum + slice.value, 0),
        color: OTHER_COLOR,
      },
    ];
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
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="mt-2 space-y-1.5">
          {data.map((entry) => (
            <div
              key={entry.name}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="truncate">{entry.name}</span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
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
