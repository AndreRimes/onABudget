"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "~/components/ui/skeleton";

// Recharts is ~1.2 MB of JavaScript, and every chart in the app pulls it in.
// Loaded through `next/dynamic` it becomes its own chunk, fetched in parallel
// with the page instead of ahead of it: the shell, the cards and the tables
// render and become interactive while the charts are still on the way.
// `ssr: false` because Recharts measures its container, which does not exist
// on the server — the same reason the charts already render nothing there.

function ChartFallback() {
  return <Skeleton className="h-80 w-full" />;
}

export const PerformanceChart = dynamic(
  () =>
    import("~/components/sections/investment/PerformanceChart").then(
      (module) => module.PerformanceChart,
    ),
  { ssr: false, loading: ChartFallback },
);

export const AllocationDonut = dynamic(
  () =>
    import("~/components/sections/investment/AllocationDonut").then(
      (module) => module.AllocationDonut,
    ),
  { ssr: false, loading: ChartFallback },
);

export const NetWorthChart = dynamic(
  () =>
    import("~/components/sections/dashboard/NetWorthChart").then(
      (module) => module.NetWorthChart,
    ),
  { ssr: false, loading: ChartFallback },
);

export const ExpenseCharts = dynamic(
  () =>
    import("~/components/sections/expense/ExpenseCharts").then(
      (module) => module.ExpenseCharts,
    ),
  { ssr: false, loading: ChartFallback },
);

export const DashboardExpenseCharts = dynamic(
  () =>
    import("~/components/sections/dashboard/DashboardExpenseCharts").then(
      (module) => module.DashboardExpenseCharts,
    ),
  { ssr: false, loading: ChartFallback },
);
