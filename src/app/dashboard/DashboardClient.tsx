"use client";

import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowDownRight,
  ArrowUpRight,
  DollarSign,
  CreditCard,
  PiggyBank,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
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
import { ACCOUNT_TYPE_LABELS } from "~/lib/account-type";
import {
  DashboardExpenseCharts,
  NetWorthChart,
} from "~/components/lazy-charts";
import { BudgetStatus } from "~/components/sections/budget/BudgetStatus";
import { api, type RouterOutputs } from "~/trpc/react";
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

type DashboardAccount = RouterOutputs["account"]["getAll"][number];
type RecentExpense = RouterOutputs["expenses"]["getRecent"][number];

function AccountIcon({
  type,
}: Readonly<{ type: DashboardAccount["accountType"] }>) {
  if (type === "INVESTMENT")
    return <PiggyBank className="text-muted-foreground h-5 w-5" />;
  if (type === "CREDIT_CARD")
    return <CreditCard className="text-muted-foreground h-5 w-5" />;
  return <DollarSign className="text-muted-foreground h-5 w-5" />;
}

function AccountBalancesCard({
  accounts,
}: Readonly<{
  accounts: DashboardAccount[] | undefined;
}>) {
  return (
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
                className="border-foreground flex items-center justify-between border-2 p-3"
              >
                <div className="flex items-center gap-3">
                  <AccountIcon type={acc.accountType} />
                  <div>
                    <p className="font-medium">{acc.name}</p>
                    <Badge variant="outline" className="text-xs">
                      {ACCOUNT_TYPE_LABELS[acc.accountType]}
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
  );
}

function RecentExpensesCard({
  expenses,
  monthLabel,
}: Readonly<{
  expenses: RecentExpense[];
  monthLabel: string;
}>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Últimas Transações</CardTitle>
        <CardDescription>{monthLabel}</CardDescription>
      </CardHeader>
      <CardContent>
        {expenses.length === 0 ? (
          <div className="text-muted-foreground flex items-center justify-center p-8">
            Sem transações este mês
          </div>
        ) : (
          <div className="border-foreground border-2">
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
                {expenses.map((expense) => (
                  <TableRow key={expense.expenses.id}>
                    <TableCell className="text-sm">
                      {format(new Date(expense.expenses.expenseDate), "dd/MM", {
                        locale: ptBR,
                      })}
                    </TableCell>
                    <TableCell className="text-sm">
                      {expense.expenses.description || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        style={{
                          borderColor:
                            expense.expense_categories.color || "var(--muted)",
                          color:
                            expense.expense_categories.color || "var(--muted)",
                        }}
                      >
                        {expense.expense_categories.name}
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
  );
}

export function DashboardClient() {
  const now = new Date();
  const currentMonthStart = format(startOfMonth(now), "yyyy-MM-dd");
  const currentMonthEnd = format(endOfMonth(now), "yyyy-MM-dd");

  // --- Data fetching ---
  const { data: accounts } = api.account.getAll.useQuery();
  // One replay for everything investment-related on this page: the summary
  // cards read `summary`, the net-worth chart reads `netWorth`. Two separate
  // queries here used to walk the entire ledger twice per load.
  const { data: overview } = api.account.getDashboardOverview.useQuery(
    { chartRange: "1y" },
    { staleTime: 5 * 60 * 1000 },
  );
  const portfolio = overview;
  const { data: currentBudget } = api.budget.getLatest.useQuery();

  // Last 12 months, which is also the window every expense figure on this page
  // is derived from — the current and previous month are slices of it.
  const last12Months = useMemo(() => {
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const m = subMonths(now, i);
      months.push({
        start: format(startOfMonth(m), "yyyy-MM-dd"),
        end: format(endOfMonth(m), "yyyy-MM-dd"),
        label: format(m, "MMM", { locale: ptBR }),
        month: format(m, "yyyy-MM"),
      });
    }
    return months;
    // `now` is a fresh Date on every render, so listing it would rebuild this
    // (and re-key every query below) on each pass. The window only has to be
    // stable for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One grouped query behind every expense number here: the two cards, the
  // twelve-month bar chart and the category pie. It returns a month × category
  // grid, not the ledger.
  const { data: monthlySummary } = api.expenses.getMonthlySummary.useQuery({
    dateRange: {
      startDate: last12Months[0]!.start,
      endDate: last12Months.at(-1)!.end,
    },
  });

  const { data: recentExpenses = [] } = api.expenses.getRecent.useQuery({
    dateRange: { startDate: currentMonthStart, endDate: currentMonthEnd },
    limit: 5,
  });

  const currentMonthKey = format(now, "yyyy-MM");
  const lastMonthKey = format(subMonths(now, 1), "yyyy-MM");

  // --- Computed values ---

  // Checking account balances
  const checkingBalance = useMemo(
    () =>
      accounts
        ?.filter((a) => a.accountType === "CHECKING")
        .reduce((sum, a) => sum + a.balance, 0) ?? 0,
    [accounts],
  );

  // Total patrimony = checking + current investment value
  const investmentValue = portfolio?.summary.totalValue ?? 0;
  const totalPatrimony = checkingBalance + investmentValue;

  // Investment returns
  const investmentGain = portfolio?.summary.periodGain ?? 0;
  const investmentGainPercent = portfolio?.summary.periodGainPercent ?? 0;

  // Monthly spend
  const totalsByMonth = useMemo(() => {
    const totals = new Map<string, number>();
    monthlySummary?.forEach((row) => {
      totals.set(row.month, (totals.get(row.month) ?? 0) + row.total);
    });
    return totals;
  }, [monthlySummary]);

  const monthlySpend = totalsByMonth.get(currentMonthKey) ?? 0;
  const lastMonthSpend = totalsByMonth.get(lastMonthKey) ?? 0;

  const monthOverMonthChange =
    lastMonthSpend > 0
      ? ((monthlySpend - lastMonthSpend) / lastMonthSpend) * 100
      : 0;

  // Budget status
  const budgetAmount = currentBudget?.amount ?? 0;

  // Monthly spend chart data (last 12 months). Months with no spending are not
  // returned by the query at all, so the axis is built from the calendar and
  // filled in — otherwise a quiet month would vanish from the chart.
  const monthlyChartData = useMemo(
    () =>
      last12Months.map((m) => ({
        month: m.label,
        amount: Number((totalsByMonth.get(m.month) ?? 0).toFixed(2)),
      })),
    [last12Months, totalsByMonth],
  );

  // Category breakdown (current month)
  const categoryChartData = useMemo(
    () =>
      (monthlySummary ?? [])
        .filter((row) => row.month === currentMonthKey)
        .map((row) => ({
          category: row.categoryName,
          amount: Number(row.total.toFixed(2)),
          fill: row.categoryColor,
        }))
        .sort((a, b) => b.amount - a.amount),
    [monthlySummary, currentMonthKey],
  );

  // Budget dialog
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const utils = api.useUtils();

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
    const value = Number.parseFloat(budgetInput.replace(",", "."));
    if (Number.isNaN(value) || value <= 0) {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="display">DASHBOARD</h1>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total Patrimony */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Patrimônio Total
            </CardTitle>
            <Wallet className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(totalPatrimony)}
            </div>
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
                investmentGain >= 0 ? "text-profit" : "text-loss"
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
                investmentGainPercent >= 0 ? "text-profit" : "text-loss"
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
            <div className="text-2xl font-bold">
              {formatCurrency(monthlySpend)}
            </div>
            <div className="flex items-center gap-1 text-xs">
              {monthOverMonthChange !== 0 && (
                <>
                  {monthOverMonthChange > 0 ? (
                    <ArrowUpRight className="text-loss h-3 w-3" />
                  ) : (
                    <ArrowDownRight className="text-profit h-3 w-3" />
                  )}
                  <span
                    className={
                      monthOverMonthChange > 0 ? "text-loss" : "text-profit"
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
                    <label
                      htmlFor="budget-amount"
                      className="text-sm font-medium"
                    >
                      Orçamento Mensal (R$)
                    </label>
                    <Input
                      id="budget-amount"
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
            <BudgetStatus budgetAmount={budgetAmount} spent={monthlySpend} />
          </CardContent>
        </Card>
      </div>

      <NetWorthChart data={overview?.netWorth} />

      <DashboardExpenseCharts
        monthlyChartData={monthlyChartData}
        categoryChartData={categoryChartData}
        monthlySpend={monthlySpend}
        monthLabel={format(now, "MMMM yyyy", { locale: ptBR })}
      />

      {/* Account Balances + Recent Transactions */}
      <div className="grid gap-4 md:grid-cols-2">
        <AccountBalancesCard accounts={accounts} />

        <RecentExpensesCard
          expenses={recentExpenses}
          monthLabel={format(now, "MMMM yyyy", { locale: ptBR })}
        />
      </div>
    </div>
  );
}
