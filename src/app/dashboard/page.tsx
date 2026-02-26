

"use client";

import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowDownRight,
  ArrowUpRight,
  DollarSign,
  PiggyBank,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
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
import { Badge } from "~/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { api } from "~/trpc/react";
import { toast } from "sonner";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

const formatPercent = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);

export default function DashboardPage() {
  const now = new Date();
  const currentMonthStart = format(startOfMonth(now), "yyyy-MM-dd");
  const currentMonthEnd = format(endOfMonth(now), "yyyy-MM-dd");

  // --- Data fetching ---
  const { data: accounts } = api.account.getAll.useQuery();
  const { data: portfolio, isLoading: isLoadingPortfolio } =
    api.investments.getPortfolioWithMarketData.useQuery();
  const { data: currentBudget } = api.budget.getLatest.useQuery();

  const { data: expensesThisMonth } = api.expenses.getAllFromUser.useQuery({
    dateRange: { startDate: currentMonthStart, endDate: currentMonthEnd },
  });

  // Last month expenses for comparison
  const lastMonth = subMonths(now, 1);
  const { data: expensesLastMonth } = api.expenses.getAllFromUser.useQuery({
    dateRange: {
      startDate: format(startOfMonth(lastMonth), "yyyy-MM-dd"),
      endDate: format(endOfMonth(lastMonth), "yyyy-MM-dd"),
    },
  });

  // Last 6 months expenses for chart
  const last6Months = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const m = subMonths(now, i);
      months.push({
        start: format(startOfMonth(m), "yyyy-MM-dd"),
        end: format(endOfMonth(m), "yyyy-MM-dd"),
        label: format(m, "MMM", { locale: ptBR }),
        month: format(m, "yyyy-MM"),
      });
    }
    return months;
  }, []);

  const { data: expenses6Months } = api.expenses.getAllFromUser.useQuery({
    dateRange: {
      startDate: last6Months[0]!.start,
      endDate: last6Months[last6Months.length - 1]!.end,
    },
  });

  const { data: categories } = api.category.getAll.useQuery();

  // --- Computed values ---

  // Checking account balances
  const checkingBalance = useMemo(
    () =>
      accounts
        ?.filter((a) => a.accountType === "CHECKING")
        .reduce((sum, a) => sum + a.balance, 0) ?? 0,
    [accounts],
  );

  const investmentAccountBalance = useMemo(
    () =>
      accounts
        ?.filter((a) => a.accountType === "INVESTMENT")
        .reduce((sum, a) => sum + a.balance, 0) ?? 0,
    [accounts],
  );

  // Total patrimony = checking + current investment value
  const investmentValue = portfolio?.totalValue ?? 0;
  const totalPatrimony = checkingBalance + investmentValue;

  // Investment returns
  const investmentGain = portfolio?.totalGain ?? 0;
  const investmentGainPercent = portfolio?.totalGainPercent ?? 0;

  // Monthly spend
  const monthlySpend = useMemo(
    () => expensesThisMonth?.reduce((s, e) => s + e.expenses.amount, 0) ?? 0,
    [expensesThisMonth],
  );

  const lastMonthSpend = useMemo(
    () => expensesLastMonth?.reduce((s, e) => s + e.expenses.amount, 0) ?? 0,
    [expensesLastMonth],
  );

  const monthOverMonthChange =
    lastMonthSpend > 0
      ? ((monthlySpend - lastMonthSpend) / lastMonthSpend) * 100
      : 0;

  // Budget status
  const budgetAmount = currentBudget?.amount ?? 0;
  const budgetUsedPercent = budgetAmount > 0 ? (monthlySpend / budgetAmount) * 100 : 0;
  const isOverBudget = budgetAmount > 0 && monthlySpend > budgetAmount;
  const budgetRemaining = budgetAmount - monthlySpend;

  // Category map
  const categoryMap = useMemo(() => {
    const map = new Map<number, { name: string; color: string }>();
    categories?.forEach((cat) =>
      map.set(cat.id, { name: cat.name, color: cat.color }),
    );
    return map;
  }, [categories]);

  // Monthly spend chart data (last 6 months)
  const monthlyChartData = useMemo(() => {
    if (!expenses6Months) return [];

    const grouped: Record<string, number> = {};
    last6Months.forEach((m) => (grouped[m.month] = 0));

    expenses6Months.forEach((e) => {
      const month = e.expenses.expenseDate.slice(0, 7); // "yyyy-MM"
      if (grouped[month] !== undefined) {
        grouped[month]! += e.expenses.amount;
      }
    });

    return last6Months.map((m) => ({
      month: m.label,
      amount: Number((grouped[m.month] ?? 0).toFixed(2)),
    }));
  }, [expenses6Months, last6Months]);

  // Category breakdown (current month)
  const categoryChartData = useMemo(() => {
    if (!expensesThisMonth || !categories) return [];

    const byCategory: Record<number, number> = {};
    expensesThisMonth.forEach((e) => {
      byCategory[e.expense_categories.id] =
        (byCategory[e.expense_categories.id] ?? 0) + e.expenses.amount;
    });

    return Object.entries(byCategory)
      .map(([catId, amount]) => {
        const info = categoryMap.get(Number(catId));
        return {
          category: info?.name ?? "Sem categoria",
          amount: Number(amount.toFixed(2)),
          fill: info?.color ?? "hsl(var(--muted))",
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [expensesThisMonth, categories, categoryMap]);

  const barChartConfig = {
    amount: {
      label: "Gastos",
      color: "hsl(var(--primary))",
    },
  } satisfies ChartConfig;

  const pieChartConfig = {
    amount: {
      label: "Valor",
    },
  } satisfies ChartConfig;

  // Budget dialog
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const utils = api.useUtils();

  const { mutate: createBudget, isPending: isCreatingBudget } =
    api.budget.create.useMutation({
      onSuccess: () => {
        utils.budget.getLatest.invalidate();
        toast.success("Orçamento definido!");
        setBudgetDialogOpen(false);
        setBudgetInput("");
      },
      onError: (err) => toast.error(err.message),
    });

  const { mutate: updateBudget, isPending: isUpdatingBudget } =
    api.budget.update.useMutation({
      onSuccess: () => {
        utils.budget.getLatest.invalidate();
        toast.success("Orçamento atualizado!");
        setBudgetDialogOpen(false);
        setBudgetInput("");
      },
      onError: (err) => toast.error(err.message),
    });

  const handleSaveBudget = () => {
    const value = parseFloat(budgetInput.replace(",", "."));
    if (isNaN(value) || value <= 0) {
      toast.error("Insira um valor válido");
      return;
    }

    if (currentBudget) {
      updateBudget({ id: currentBudget.id, amount: value });
    } else {
      createBudget({
        amount: value,
        startPeriod: currentMonthStart,
      });
    }
  };

  // Recent transactions (last 5)
  const recentExpenses = useMemo(
    () =>
      expensesThisMonth
        ?.sort(
          (a, b) =>
            new Date(b.expenses.expenseDate).getTime() -
            new Date(a.expenses.expenseDate).getTime(),
        )
        .slice(0, 5) ?? [],
    [expensesThisMonth],
  );

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total Patrimony */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Patrimônio Total</CardTitle>
            <Wallet className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalPatrimony)}</div>
            <p className="text-muted-foreground text-xs">
              Conta corrente + investimentos
            </p>
          </CardContent>
        </Card>

        {/* Investment Returns */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Rendimento Investimentos
            </CardTitle>
            <TrendingUp className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div
              className={`flex items-center gap-2 text-2xl font-bold ${
                investmentGain >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {investmentGain >= 0 ? (
                <ArrowUpRight className="h-5 w-5" />
              ) : (
                <ArrowDownRight className="h-5 w-5" />
              )}
              {formatCurrency(investmentGain)}
            </div>
            <p
              className={`text-xs ${
                investmentGainPercent >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {formatPercent(investmentGainPercent)} de rentabilidade
            </p>
          </CardContent>
        </Card>

        {/* Monthly Spend */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gasto Mensal</CardTitle>
            <DollarSign className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(monthlySpend)}</div>
            <div className="flex items-center gap-1 text-xs">
              {monthOverMonthChange !== 0 && (
                <>
                  {monthOverMonthChange > 0 ? (
                    <ArrowUpRight className="h-3 w-3 text-red-500" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3 text-green-500" />
                  )}
                  <span
                    className={
                      monthOverMonthChange > 0 ? "text-red-500" : "text-green-500"
                    }
                  >
                    {Math.abs(monthOverMonthChange).toFixed(1)}%
                  </span>
                </>
              )}
              <span className="text-muted-foreground">vs mês anterior</span>
            </div>
          </CardContent>
        </Card>

        {/* Budget Status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Orçamento</CardTitle>
            <Dialog open={budgetDialogOpen} onOpenChange={setBudgetDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() =>
                    setBudgetInput(currentBudget?.amount?.toString() ?? "")
                  }
                >
                  <Target className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {currentBudget ? "Editar Orçamento" : "Definir Orçamento"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Orçamento Mensal (R$)
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Ex: 3000.00"
                      value={budgetInput}
                      onChange={(e) => setBudgetInput(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancelar</Button>
                  </DialogClose>
                  <Button
                    onClick={handleSaveBudget}
                    disabled={isCreatingBudget || isUpdatingBudget}
                  >
                    Salvar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {budgetAmount > 0 ? (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-bold">
                    {budgetUsedPercent.toFixed(0)}%
                  </span>
                  <Badge variant={isOverBudget ? "destructive" : "outline"}>
                    {isOverBudget ? "Acima" : "Dentro"}
                  </Badge>
                </div>
                {/* Progress bar */}
                <div className="bg-secondary h-2 w-full overflow-hidden rounded-full">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isOverBudget ? "bg-red-500" : "bg-green-500"
                    }`}
                    style={{
                      width: `${Math.min(budgetUsedPercent, 100)}%`,
                    }}
                  />
                </div>
                <p className="text-muted-foreground text-xs">
                  {isOverBudget
                    ? `${formatCurrency(Math.abs(budgetRemaining))} acima do orçamento`
                    : `${formatCurrency(budgetRemaining)} restantes de ${formatCurrency(budgetAmount)}`}
                </p>
              </div>
            ) : (
              <div className="text-muted-foreground space-y-1">
                <p className="text-sm">Nenhum orçamento definido</p>
                <p className="text-xs">
                  Clique no ícone acima para definir
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Spending Trend - Last 6 Months */}
        <Card>
          <CardHeader>
            <CardTitle>Evolução de Gastos</CardTitle>
            <CardDescription>Últimos 6 meses</CardDescription>
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
                    tickFormatter={(v) =>
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
                  <Bar
                    dataKey="amount"
                    fill="#7f22fe"
                    radius={[4, 4, 0, 0]}
                  />
                  {budgetAmount > 0 && (
                    <CartesianGrid
                      horizontal={false}
                      vertical={false}
                      strokeDasharray="5 5"
                    />
                  )}
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Category Breakdown - Current Month */}
        <Card>
          <CardHeader>
            <CardTitle>Gastos por Categoria</CardTitle>
            <CardDescription>
              {format(now, "MMMM yyyy", { locale: ptBR })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {categoryChartData.length === 0 ? (
              <div className="text-muted-foreground flex h-64 items-center justify-center">
                Sem dados
              </div>
            ) : (
              <ChartContainer config={pieChartConfig} className="mx-auto h-64 w-full">
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
                                y={(viewBox.cy || 0) + 20}
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
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: item.fill }}
                      />
                      <span className="text-muted-foreground truncate">
                        {item.category}
                      </span>
                    </div>
                    <span className="font-medium">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Account Balances + Recent Transactions */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Account Balances */}
        <Card>
          <CardHeader>
            <CardTitle>Saldo das Contas</CardTitle>
          </CardHeader>
          <CardContent>
            {!accounts || accounts.length === 0 ? (
              <div className="text-muted-foreground flex items-center justify-center p-8">
                Nenhuma conta cadastrada
              </div>
            ) : (
              <div className="space-y-4">
                {accounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      {acc.accountType === "CHECKING" ? (
                        <DollarSign className="text-muted-foreground h-5 w-5" />
                      ) : (
                        <PiggyBank className="text-muted-foreground h-5 w-5" />
                      )}
                      <div>
                        <p className="font-medium">{acc.name}</p>
                        <Badge variant="outline" className="text-xs">
                          {acc.accountType === "CHECKING"
                            ? "Conta Corrente"
                            : "Investimento"}
                        </Badge>
                      </div>
                    </div>
                    <span className="font-mono font-semibold">
                      {formatCurrency(acc.balance)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card>
          <CardHeader>
            <CardTitle>Últimas Transações</CardTitle>
            <CardDescription>
              {format(now, "MMMM yyyy", { locale: ptBR })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentExpenses.length === 0 ? (
              <div className="text-muted-foreground flex items-center justify-center p-8">
                Sem transações este mês
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentExpenses.map((expense) => (
                      <TableRow key={expense.expenses.id}>
                        <TableCell className="text-sm">
                          {format(
                            new Date(expense.expenses.expenseDate),
                            "dd/MM",
                            { locale: ptBR },
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {expense.expenses.description || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            style={{
                              borderColor:
                                expense.expense_categories.color || "hsl(var(--muted))",
                              color:
                                expense.expense_categories.color || "hsl(var(--muted))",
                            }}
                          >
                            {categoryMap.get(expense.expense_categories.id)?.name ??
                              "Sem categoria"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-medium">
                          {formatCurrency(expense.expenses.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}