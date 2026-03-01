"use client";

import {
  endOfMonth,
  endOfYear,
  format,
  parseISO,
  startOfMonth,
  startOfYear,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMemo, useState } from "react";
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
import { Target, Trash2 } from "lucide-react";
import { CreateCategoryDialog } from "~/components/sections/category/CreateCategoryDialog";
import { CreateExpenseDialog } from "~/components/sections/expense/CreateExpenseDialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { api } from "~/trpc/react";

type DateFilter =
  | "current-month"
  | "last-month"
  | "last-3-months"
  | "last-6-months"
  | "current-year"
  | "all";

export default function CheckingPage() {
  const [dateFilter, setDateFilter] = useState<DateFilter>("current-month");
  const [selectedAccount, setSelectedAccount] = useState<number | "all">("all");

  const dateRange = useMemo(() => {
    const now = new Date();

    switch (dateFilter) {
      case "current-month":
        return {
          startDate: format(startOfMonth(now), "yyyy-MM-dd"),
          endDate: format(endOfMonth(now), "yyyy-MM-dd"),
        };
      case "last-month":
        const lastMonth = subMonths(now, 1);
        return {
          startDate: format(startOfMonth(lastMonth), "yyyy-MM-dd"),
          endDate: format(endOfMonth(lastMonth), "yyyy-MM-dd"),
        };
      case "last-3-months":
        return {
          startDate: format(subMonths(now, 3), "yyyy-MM-dd"),
          endDate: format(now, "yyyy-MM-dd"),
        };
      case "last-6-months":
        return {
          startDate: format(subMonths(now, 6), "yyyy-MM-dd"),
          endDate: format(now, "yyyy-MM-dd"),
        };
      case "current-year":
        return {
          startDate: format(startOfYear(now), "yyyy-MM-dd"),
          endDate: format(endOfYear(now), "yyyy-MM-dd"),
        };
      case "all":
        return undefined;
      default:
        return undefined;
    }
  }, [dateFilter]);

  const { data: accounts } = api.account.getAll.useQuery();
  const checkingAccounts =
    accounts?.filter((acc) => acc.accountType === "CHECKING") || [];

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

  // Normalize expenses data
  const allExpenses = useMemo(() => {
    if (selectedAccount === "all") {
      return expensesFromUser || [];
    }
    return expensesFromAccount || [];
  }, [selectedAccount, expensesFromUser, expensesFromAccount]);

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

  const chartData = useMemo(() => {
    if (!allExpenses) return [];

    const getGroupKey = (date: Date) => {
      switch (dateFilter) {
        case "current-month":
        case "last-month":
          return format(date, "yyyy-MM-dd");
        case "last-3-months":
        case "last-6-months":
        case "current-year":
          // Group by month
          return format(date, "yyyy-MM");
        case "all":
          return format(date, "yyyy");
        default:
          return format(date, "yyyy-MM-dd");
      }
    };

    const getFormattedLabel = (groupKey: string) => {
      switch (dateFilter) {
        case "current-month":
        case "last-month":
          return format(parseISO(groupKey), "dd/MM", { locale: ptBR });
        case "last-3-months":
        case "last-6-months":
        case "current-year":
          return format(parseISO(groupKey + "-01"), "MMM/yy", { locale: ptBR });
        case "all":
          return groupKey;
        default:
          return groupKey;
      }
    };

    const expensesByPeriod = allExpenses.reduce(
      (acc, expense) => {
        const date = parseISO(expense.expenses.expenseDate);
        const groupKey = getGroupKey(date);
        if (!acc[groupKey]) {
          acc[groupKey] = 0;
        }
        acc[groupKey] += expense.expenses.amount;
        return acc;
      },
      {} as Record<string, number>,
    );

    const data = Object.entries(expensesByPeriod)
      .map(([groupKey, amount]) => ({
        date: groupKey,
        amount: Number(amount.toFixed(2)),
        formattedDate: getFormattedLabel(groupKey),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    let cumulative = 0;
    return data.map((item) => {
      cumulative += item.amount;
      return {
        ...item,
        cumulative: Number(cumulative.toFixed(2)),
      };
    });
  }, [allExpenses, dateFilter]);

  // Budget data
  const { data: currentBudget } = api.budget.getLatest.useQuery();
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

  const budgetAmount = currentBudget?.amount ?? 0;
  const budgetUsedPercent = budgetAmount > 0 ? (stats.total / budgetAmount) * 100 : 0;
  const isOverBudget = budgetAmount > 0 && stats.total > budgetAmount;
  const budgetRemaining = budgetAmount - stats.total;

  const { data: categories } = api.category.getAll.useQuery();
  const [deletingExpenseId, setDeletingExpenseId] = useState<number | null>(null);

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
          <CreateCategoryDialog />
          <CreateExpenseDialog />
        </div>
      </div>

      <div className="flex justify-end gap-4">
        <Select
          value={selectedAccount.toString()}
          onValueChange={(value) =>
            setSelectedAccount(value === "all" ? "all" : Number(value))
          }
        >
          <SelectTrigger className="w-50">
            <SelectValue placeholder="Selecione a conta" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as contas</SelectItem>
            {checkingAccounts.map((account) => (
              <SelectItem key={account.id} value={account.id.toString()}>
                {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={dateFilter}
          onValueChange={(value) => setDateFilter(value as DateFilter)}
        >
          <SelectTrigger className="w-50">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current-month">Mês atual</SelectItem>
            <SelectItem value="last-month">Mês passado</SelectItem>
            <SelectItem value="last-3-months">Últimos 3 meses</SelectItem>
            <SelectItem value="last-6-months">Últimos 6 meses</SelectItem>
            <SelectItem value="current-year">Ano atual</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
            <CardTitle>Evolução de Gastos</CardTitle>
            <CardDescription>Acumulado ao longo do período</CardDescription>
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
                          if (payload?.[0]) {
                            const date = payload[0].payload.date;
                            return format(parseISO(date), "dd/MM/yyyy", {
                              locale: ptBR,
                            });
                          }
                          return value;
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
                    dataKey="cumulative"
                    type="monotone"
                    fill="url(#fillCumulative)"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                  />
                  {budgetAmount > 0 && (
                    <ReferenceLine
                      y={budgetAmount}
                      stroke="hsl(var(--destructive))"
                      strokeDasharray="6 4"
                      strokeWidth={2}
                    >
                      <Label
                        value={`Orçamento: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(budgetAmount)}`}
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
          <CardTitle>Transações Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              Carregando...
            </div>
          ) : !allExpenses || allExpenses.length === 0 ? (
            <div className="text-muted-foreground flex items-center justify-center p-8">
              Nenhuma despesa encontrada
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
                  {allExpenses
                    .sort(
                      (a, b) =>
                        parseISO(b.expenses.expenseDate).getTime() -
                        parseISO(a.expenses.expenseDate).getTime(),
                    )
                    .map((expense) => (
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
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeletingExpenseId(expense.expenses.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
        onOpenChange={(open) => { if (!open) setDeletingExpenseId(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover despesa</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja remover esta despesa? Esta ação não pode ser desfeita.
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
