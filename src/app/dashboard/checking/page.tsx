"use client";

import { format, parseISO, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { MoreHorizontal, Pencil, Target, Trash2 } from "lucide-react";
import { CreateCategoryDialog } from "~/components/sections/category/CreateCategoryDialog";
import { CreateExpenseDialog } from "~/components/sections/expense/CreateExpenseDialog";
import {
  EditExpenseDialog,
  type EditableExpense,
} from "~/components/sections/expense/EditExpenseDialog";
import {
  ExpenseFilters,
  defaultExpenseFilters,
  hasNarrowingFilters,
  monthsInPeriod,
  periodLabel,
  periodRange,
  type ExpenseFilterState,
} from "~/components/sections/expense/ExpenseFilters";
import { ImportFaturaDialog } from "~/components/sections/expense/ImportFaturaDialog";
import { ImportStatementDialog } from "~/components/sections/expense/ImportStatementDialog";
import { RecurringExpensesDialog } from "~/components/sections/expense/RecurringExpensesDialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { toast } from "sonner";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { isSpendingAccount } from "~/lib/account-type";
import { stripAccents } from "~/lib/parse";
import { api } from "~/trpc/react";

export default function CheckingPage() {
  const [filters, setFilters] = useState<ExpenseFilterState>(
    defaultExpenseFilters,
  );
  const selectedAccount = filters.accountId;

  const dateRange = useMemo(() => periodRange(filters), [filters]);

  const { data: accounts } = api.account.getAll.useQuery();
  const spendingAccounts = accounts?.filter(isSpendingAccount) ?? [];

  const [overflowDialog, setOverflowDialog] = useState<
    "import" | "fatura" | "recurring" | "category" | null
  >(null);
  const [editingExpense, setEditingExpense] = useState<EditableExpense | null>(
    null,
  );

  const { data: expensesFromUser } = api.expenses.getAllFromUser.useQuery(
    { dateRange },
    { enabled: selectedAccount === "all" },
  );
  const { data: expensesFromAccount, isLoading: isLoadingAccount } =
    api.expenses.getAllFromAccount.useQuery(
      { accountId: selectedAccount as number, dateRange },
      { enabled: selectedAccount !== "all" },
    );

  const isLoading =
    selectedAccount === "all" ? !expensesFromUser : isLoadingAccount;

  // Months that have spending, so the period picker only offers real ones.
  const { data: expenseMonths } = api.expenses.getMonths.useQuery({
    accountId: selectedAccount === "all" ? undefined : selectedAccount,
  });

  // Category and text filters are applied here rather than server-side: the
  // period query has already narrowed the rows to something small, and doing it
  // in the client keeps typing in the search box instant.
  const allExpenses = useMemo(() => {
    const rows =
      selectedAccount === "all"
        ? (expensesFromUser ?? [])
        : (expensesFromAccount ?? []);

    const categoryIds = new Set(filters.categoryIds);
    // Accent-insensitive, so "acai" finds "AÇAÍ".
    const term = stripAccents(filters.search).trim().toLowerCase();

    if (categoryIds.size === 0 && term === "") return rows;

    return rows.filter((row) => {
      if (categoryIds.size > 0 && !categoryIds.has(row.expenses.categoryId)) {
        return false;
      }
      if (term === "") return true;
      const haystack = stripAccents(
        `${row.expenses.description ?? ""} ${row.expense_categories.name}`,
      ).toLowerCase();
      return haystack.includes(term);
    });
  }, [
    selectedAccount,
    expensesFromUser,
    expensesFromAccount,
    filters.categoryIds,
    filters.search,
  ]);

  // Calculate statistics
  const stats = useMemo(() => {
    if (!allExpenses) return { total: 0, count: 0, average: 0 };

    const total = allExpenses.reduce(
      (sum, exp) => sum + exp.expenses.amount,
      0,
    );
    const count = allExpenses.length;
    const average = count > 0 ? total / count : 0;

    return { total, count, average };
  }, [allExpenses]);

  // Within a single month, running-total-against-budget is the useful shape.
  // Across several months it is not: the line only ever climbs, so it says
  // nothing about whether any given month was good or bad. Multi-month periods
  // therefore plot the total *per month* instead.
  const isDailyChart = filters.mode === "month";

  const chartData = useMemo(() => {
    const expensesByPeriod = allExpenses.reduce(
      (acc, expense) => {
        const date = parseISO(expense.expenses.expenseDate);
        const groupKey = format(date, isDailyChart ? "yyyy-MM-dd" : "yyyy-MM");
        acc[groupKey] = (acc[groupKey] ?? 0) + expense.expenses.amount;
        return acc;
      },
      {} as Record<string, number>,
    );

    const data = Object.entries(expensesByPeriod)
      .map(([groupKey, amount]) => ({
        date: groupKey,
        amount: Number(amount.toFixed(2)),
        formattedDate: isDailyChart
          ? format(parseISO(groupKey), "dd/MM", { locale: ptBR })
          : format(parseISO(`${groupKey}-01`), "MMM/yy", { locale: ptBR }),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    let cumulative = 0;
    return data.map((item) => {
      cumulative += item.amount;
      return { ...item, cumulative: Number(cumulative.toFixed(2)) };
    });
  }, [allExpenses, isDailyChart]);

  // Distinct months present, used to scale a monthly budget over "Tudo".
  const distinctMonths = useMemo(
    () =>
      new Set(allExpenses.map((e) => e.expenses.expenseDate.slice(0, 7))).size,
    [allExpenses],
  );

  const sortedExpenses = useMemo(() => {
    return [...allExpenses].sort((a, b) => {
      switch (filters.sort) {
        case "date-asc":
          return a.expenses.expenseDate.localeCompare(b.expenses.expenseDate);
        case "amount-desc":
          return b.expenses.amount - a.expenses.amount;
        case "amount-asc":
          return a.expenses.amount - b.expenses.amount;
        default:
          return b.expenses.expenseDate.localeCompare(a.expenses.expenseDate);
      }
    });
  }, [allExpenses, filters.sort]);

  // Budget data
  const { data: currentBudget } = api.budget.getLatest.useQuery();
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const utils = api.useUtils();

  // Post any due fixed expenses. Idempotent server-side (each occurrence has a
  // unique source hash), so the only reason to guard is to avoid firing it on
  // every re-render.
  const hasMaterialized = useRef(false);
  const { mutate: materializeRecurring } =
    api.expenses.materializeRecurring.useMutation({
      onSuccess: ({ created }) => {
        if (created === 0) return;
        void utils.expenses.getAllFromUser.invalidate();
        void utils.expenses.getAllFromAccount.invalidate();
        toast.success(
          `${created} despesa${created !== 1 ? "s" : ""} fixa${created !== 1 ? "s" : ""} lançada${created !== 1 ? "s" : ""}`,
        );
      },
    });

  useEffect(() => {
    if (hasMaterialized.current) return;
    hasMaterialized.current = true;
    materializeRecurring();
  }, [materializeRecurring]);

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
    const now = new Date();
    if (currentBudget) {
      updateBudget({ id: currentBudget.id, amount: value });
    } else {
      createBudget({
        amount: value,
        startPeriod: format(startOfMonth(now), "yyyy-MM-dd"),
      });
    }
  };

  // The budget is a *monthly* figure, so comparing a whole year of spending
  // against it would always read as a catastrophic overrun. Scale it to the
  // number of months on screen and say so in the card.
  const monthlyBudget = currentBudget?.amount ?? 0;
  const periodMonths = monthsInPeriod(filters, distinctMonths);
  const budgetAmount = monthlyBudget * periodMonths;
  const budgetUsedPercent =
    budgetAmount > 0 ? (stats.total / budgetAmount) * 100 : 0;
  const isOverBudget = budgetAmount > 0 && stats.total > budgetAmount;
  const budgetRemaining = budgetAmount - stats.total;

  const { data: categories } = api.category.getAll.useQuery();
  const [deletingExpenseId, setDeletingExpenseId] = useState<number | null>(
    null,
  );

  const { mutate: deleteExpense, isPending: isDeleting } =
    api.expenses.delete.useMutation({
      onSuccess: () => {
        utils.expenses.getAllFromUser.invalidate();
        utils.expenses.getAllFromAccount.invalidate();
        toast.success("Despesa removida com sucesso!");
        setDeletingExpenseId(null);
      },
      onError: (err) => toast.error("Erro ao remover despesa: " + err.message),
    });

  const categoryMap = useMemo(() => {
    const map = new Map<number, { name: string; color: string }>();
    categories?.forEach((cat) =>
      map.set(cat.id, { name: cat.name, color: cat.color }),
    );
    return map;
  }, [categories]);

  const categoryChartData = useMemo(() => {
    if (!allExpenses || !categories) return [];

    const expensesByCategory = allExpenses.reduce(
      (acc, expense) => {
        const categoryId = expense.expense_categories.id;
        if (!acc[categoryId]) {
          acc[categoryId] = 0;
        }
        acc[categoryId] += expense.expenses.amount;
        return acc;
      },
      {} as Record<number, number>,
    );

    return Object.entries(expensesByCategory)
      .map(([categoryId, amount]) => {
        const categoryInfo = categoryMap.get(Number(categoryId));
        return {
          category: categoryInfo?.name || "Sem categoria",
          amount: Number(amount.toFixed(2)),
          fill: categoryInfo?.color || "hsl(var(--muted))",
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [allExpenses, categories, categoryMap]);

  const totalExpenses = useMemo(() => {
    return categoryChartData.reduce((sum, item) => sum + item.amount, 0);
  }, [categoryChartData]);

  const areaChartConfig = {
    cumulative: {
      label: "Gasto Acumulado",
      color: "hsl(var(--primary))",
    },
    amount: {
      label: "Gasto no Mês",
      color: "hsl(var(--primary))",
    },
    budget: {
      label: "Orçamento",
      color: "hsl(var(--destructive))",
    },
  } satisfies ChartConfig;

  const pieChartConfig = {
    amount: {
      label: "Valor",
    },
  } satisfies ChartConfig;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Checking Accounts</h1>

        <div className="flex gap-3">
          {/* Controlled from the menu below: a trigger nested in the dropdown
              would be unmounted with the menu before the dialog could open. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Mais ações</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setOverflowDialog("import")}>
                Importar extrato (conta)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setOverflowDialog("fatura")}>
                Importar fatura (cartão)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setOverflowDialog("recurring")}>
                Despesas fixas
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setOverflowDialog("category")}>
                Nova categoria
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <CreateExpenseDialog />
        </div>
      </div>

      <ImportStatementDialog
        open={overflowDialog === "import"}
        onOpenChange={(open) => setOverflowDialog(open ? "import" : null)}
      />
      <ImportFaturaDialog
        open={overflowDialog === "fatura"}
        onOpenChange={(open) => setOverflowDialog(open ? "fatura" : null)}
      />
      <RecurringExpensesDialog
        open={overflowDialog === "recurring"}
        onOpenChange={(open) => setOverflowDialog(open ? "recurring" : null)}
      />
      <CreateCategoryDialog
        open={overflowDialog === "category"}
        onOpenChange={(open) => setOverflowDialog(open ? "category" : null)}
      />
      <EditExpenseDialog
        expense={editingExpense}
        onClose={() => setEditingExpense(null)}
      />

      <ExpenseFilters
        value={filters}
        onChange={setFilters}
        accounts={spendingAccounts}
        categories={categories ?? []}
        months={expenseMonths ?? []}
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total de Gastos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: "BRL",
              }).format(stats.total)}
            </div>
            <p className="text-muted-foreground text-xs">
              {periodLabel(filters)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Número de Transações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.count}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gasto Médio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: "BRL",
              }).format(stats.average)}
            </div>
          </CardContent>
        </Card>

        {/* Budget Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Orçamento
              {periodMonths > 1 && (
                <span className="text-muted-foreground font-normal">
                  {" "}
                  ({periodMonths} meses)
                </span>
              )}
            </CardTitle>
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
                    ? `${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Math.abs(budgetRemaining))} acima do orçamento`
                    : `${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(budgetRemaining)} restantes de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(budgetAmount)}`}
                </p>
              </div>
            ) : (
              <div className="text-muted-foreground space-y-1">
                <p className="text-sm">Nenhum orçamento definido</p>
                <p className="text-xs">Clique no ícone acima para definir</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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
              <ChartContainer
                config={areaChartConfig}
                className="h-87.5 w-full"
              >
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient
                      id="fillCumulative"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#7f22fe" stopOpacity={0.8} />
                      <stop
                        offset="95%"
                        stopColor="#7f22fe"
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
                    tickFormatter={(value) =>
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
                          const entry = payload?.[0] as
                            | { payload?: { date?: string } }
                            | undefined;
                          const date = entry?.payload?.date;
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
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                  />
                  {/* Always the monthly figure: in month mode the cumulative
                      line is compared against it, in multi-month mode each
                      month's own total is. */}
                  {monthlyBudget > 0 && (
                    <ReferenceLine
                      y={monthlyBudget}
                      stroke="hsl(var(--destructive))"
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
                      <ChartTooltipContent
                        hideLabel
                        formatter={(value, name, item) => (
                          <>
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                                style={{
                                  backgroundColor: item.payload.fill,
                                }}
                              />
                              <span className="font-medium">
                                {item.payload.category}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              <span className="text-muted-foreground">
                                Valor:
                              </span>
                              <span className="font-bold text-white">
                                {new Intl.NumberFormat("pt-BR", {
                                  style: "currency",
                                  currency: "BRL",
                                }).format(value as number)}
                              </span>
                              <span className="text-white">
                                (
                                {(
                                  ((value as number) / totalExpenses) *
                                  100
                                ).toFixed(1)}
                                %)
                              </span>
                            </div>
                          </>
                        )}
                      />
                    }
                  />
                  <Pie
                    data={categoryChartData}
                    dataKey="amount"
                    nameKey="category"
                    innerRadius={60}
                    strokeWidth={5}
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
                                className="fill-white text-3xl font-bold"
                              >
                                {new Intl.NumberFormat("pt-BR", {
                                  style: "currency",
                                  currency: "BRL",
                                  minimumFractionDigits: 0,
                                }).format(totalExpenses)}
                              </tspan>
                              <tspan
                                x={viewBox.cx}
                                y={(viewBox.cy || 0) + 24}
                                className="fill-white"
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
            ) : (
              <div className="text-muted-foreground flex h-87.5 items-center justify-center">
                Nenhum dado disponível para o período selecionado
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transações</CardTitle>
          <CardDescription>
            {sortedExpenses.length} lançamento
            {sortedExpenses.length === 1 ? "" : "s"} · {periodLabel(filters)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              Carregando...
            </div>
          ) : sortedExpenses.length === 0 ? (
            <div className="text-muted-foreground flex items-center justify-center p-8">
              {hasNarrowingFilters(filters)
                ? "Nenhuma despesa corresponde aos filtros"
                : `Nenhuma despesa em ${periodLabel(filters)}`}
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
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedExpenses.map((expense) => (
                    <TableRow key={expense.expenses.id}>
                      <TableCell>
                        {format(
                          parseISO(expense.expenses.expenseDate),
                          "dd/MM/yyyy",
                          { locale: ptBR },
                        )}
                      </TableCell>
                      <TableCell>
                        {expense.expenses.description || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          style={{
                            borderColor:
                              expense.expense_categories.color ||
                              "hsl(var(--muted))",
                            color:
                              expense.expense_categories.color ||
                              "hsl(var(--muted))",
                          }}
                        >
                          {categoryMap.get(expense.expense_categories.id)
                            ?.name || "Sem categoria"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        }).format(expense.expenses.amount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-foreground h-8 w-8"
                            onClick={() =>
                              setEditingExpense({
                                id: expense.expenses.id,
                                categoryId: expense.expenses.categoryId,
                                description: expense.expenses.description,
                                amount: expense.expenses.amount,
                                expenseDate: expense.expenses.expenseDate,
                              })
                            }
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive h-8 w-8"
                            onClick={() =>
                              setDeletingExpenseId(expense.expenses.id)
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={deletingExpenseId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingExpenseId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover despesa</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            Tem certeza que deseja remover esta despesa? Esta ação não pode ser
            desfeita.
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={() => {
                if (deletingExpenseId !== null) {
                  deleteExpense({ id: deletingExpenseId });
                }
              }}
            >
              {isDeleting ? "Removendo..." : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
