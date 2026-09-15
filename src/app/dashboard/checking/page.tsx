"use client";

import {
  eachDayOfInterval,
  endOfMonth,
  format,
  isBefore,
  parseISO,
  startOfDay,
  startOfMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { isSpendingAccount } from "~/lib/account-type";
import { formatCurrency } from "~/lib/format";
import { stripAccents } from "~/lib/parse";
import { useDebouncedValue } from "~/lib/use-debounced-value";
import { api } from "~/trpc/react";
import { ExpenseCharts } from "~/components/lazy-charts";

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
  // Debounced: the filtering below feeds every total, both charts and the
  // whole table, so re-running it on each keystroke re-rendered all of that
  // per character typed. A short pause is not noticeable; the stutter was.
  const searchTerm = useDebouncedValue(filters.search, 200);

  const allExpenses = useMemo(() => {
    const rows =
      selectedAccount === "all"
        ? (expensesFromUser ?? [])
        : (expensesFromAccount ?? []);

    const categoryIds = new Set(filters.categoryIds);
    // Accent-insensitive, so "acai" finds "AÇAÍ".
    const term = stripAccents(searchTerm).trim().toLowerCase();

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
    searchTerm,
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

    if (Object.keys(expensesByPeriod).length === 0) return [];

    if (!isDailyChart) {
      const data = Object.entries(expensesByPeriod)
        .map(([groupKey, amount]) => ({
          date: groupKey,
          amount: Number(amount.toFixed(2)),
          formattedDate: format(parseISO(`${groupKey}-01`), "MMM/yy", {
            locale: ptBR,
          }),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      let cumulative = 0;
      return data.map((item) => {
        cumulative += item.amount;
        return { ...item, cumulative: Number(cumulative.toFixed(2)) };
      });
    }

    // Every day of the month, not only the ones that had a transaction. The
    // axis is categorical, so plotting just the spending days squeezes the
    // gaps shut: the running total then climbs on a timeline that is not the
    // month's, and the line stops at the last purchase instead of reaching
    // month end. Days with no spending hold the previous total, flat.
    const monthStart = startOfMonth(parseISO(`${filters.month}-01`));
    const monthEnd = endOfMonth(monthStart);
    const today = startOfDay(new Date());
    // Only truncate a month still in progress — a future month has no "today"
    // inside it and would leave an empty interval.
    const lastDay =
      isBefore(today, monthEnd) && !isBefore(today, monthStart)
        ? today
        : monthEnd;

    let cumulative = 0;
    return eachDayOfInterval({ start: monthStart, end: lastDay }).map((day) => {
      const groupKey = format(day, "yyyy-MM-dd");
      const amount = Number((expensesByPeriod[groupKey] ?? 0).toFixed(2));
      cumulative += amount;
      return {
        date: groupKey,
        amount,
        formattedDate: format(day, "dd/MM", { locale: ptBR }),
        cumulative: Number(cumulative.toFixed(2)),
      };
    });
  }, [allExpenses, isDailyChart, filters.month]);

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
        void utils.budget.getLatest.invalidate();
        toast.success("Orçamento definido!");
        setBudgetDialogOpen(false);
        setBudgetInput("");
      },
      onError: (err) => toast.error(err.message),
    });

  const { mutate: updateBudget, isPending: isUpdatingBudget } =
    api.budget.update.useMutation({
      onSuccess: () => {
        void utils.budget.getLatest.invalidate();
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
        void utils.expenses.getAllFromUser.invalidate();
        void utils.expenses.getAllFromAccount.invalidate();
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
        acc[categoryId] ??= 0;
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
          fill: categoryInfo?.color || "var(--muted)",
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [allExpenses, categories, categoryMap]);

  const totalExpenses = useMemo(() => {
    return categoryChartData.reduce((sum, item) => sum + item.amount, 0);
  }, [categoryChartData]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="form-label">FORM CC-01 · LANÇAMENTOS</p>
          <h1 className="display mt-1">CONTA CORRENTE</h1>
        </div>

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
              {formatCurrency(stats.total)}
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
              {formatCurrency(stats.average)}
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
                  <span
                    className={`stamp ${
                      isOverBudget
                        ? "border-destructive text-destructive"
                        : "border-profit text-profit"
                    }`}
                  >
                    {isOverBudget ? "Acima" : "Dentro"}
                  </span>
                </div>
                <div className="border-foreground bg-muted h-3 w-full overflow-hidden border-2">
                  <div
                    className={`h-full transition-all ${
                      isOverBudget ? "bg-loss" : "bg-profit"
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
                <p className="text-xs">Clique no ícone acima para definir</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ExpenseCharts
        chartData={chartData}
        isDailyChart={isDailyChart}
        monthlyBudget={monthlyBudget}
        categoryChartData={categoryChartData}
        totalExpenses={totalExpenses}
      />

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
            <div className="border-2">
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
                              "var(--muted)",
                            color:
                              expense.expense_categories.color ||
                              "var(--muted)",
                          }}
                        >
                          {categoryMap.get(expense.expense_categories.id)
                            ?.name || "Sem categoria"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(expense.expenses.amount)}
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
