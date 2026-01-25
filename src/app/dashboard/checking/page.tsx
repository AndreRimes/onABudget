

"use client";

import { endOfMonth, endOfYear, format, startOfMonth, startOfYear, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Label, Pie, PieChart, XAxis, YAxis } from "recharts";
import { CreateCategoryDialog } from "~/components/sections/category/CreateCategoryDialog";
import { CreateExpenseDialog } from "~/components/sections/expense/CreateExpenseDialog";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import type { ChartConfig } from "~/components/ui/chart";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "~/components/ui/chart";
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

type DateFilter = "current-month" | "last-month" | "last-3-months" | "last-6-months" | "current-year" | "all";

export default function CheckingPage() {
  const [dateFilter, setDateFilter] = useState<DateFilter>("current-month");
  const [selectedAccount, setSelectedAccount] = useState<number | "all">("all");

  // Get date range based on filter
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

  // Fetch accounts
  const { data: accounts } = api.account.getAll.useQuery();
  const checkingAccounts = accounts?.filter(acc => acc.accountType === "CHECKING") || [];

  // Fetch expenses
  const { data: expensesFromUser } = api.expenses.getAllFromUser.useQuery(
    { dateRange },
    { enabled: selectedAccount === "all" }
  );
  const { data: expensesFromAccount, isLoading: isLoadingAccount } = api.expenses.getAllFromAccount.useQuery(
    { accountId: selectedAccount as number, dateRange },
    { enabled: selectedAccount !== "all" }
  );

  const isLoading = selectedAccount === "all" ? !expensesFromUser : isLoadingAccount;

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
    
    const total = allExpenses.reduce((sum, exp) => sum + exp.expenses.amount, 0);
    const count = allExpenses.length;
    const average = count > 0 ? total / count : 0;

    return { total, count, average };
  }, [allExpenses]);

  // Prepare chart data - group expenses by date
  const chartData = useMemo(() => {
    if (!allExpenses) return [];

    // Group expenses by date
    const expensesByDate = allExpenses.reduce((acc, expense) => {
      const date = expense.expenses.expenseDate;
      if (!acc[date]) {
        acc[date] = 0;
      }
      acc[date] += expense.expenses.amount;
      return acc;
    }, {} as Record<string, number>);

    // Convert to array and sort by date
    const data = Object.entries(expensesByDate)
      .map(([date, amount]) => ({
        date,
        amount: Number(amount.toFixed(2)),
        formattedDate: format(new Date(date), "dd/MM", { locale: ptBR })
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate cumulative amounts
    let cumulative = 0;
    return data.map(item => {
      cumulative += item.amount;
      return {
        ...item,
        cumulative: Number(cumulative.toFixed(2))
      };
    });
  }, [allExpenses]);

  const { data: categories } = api.category.getAll.useQuery();
  const categoryMap = useMemo(() => {
    const map = new Map<number, { name: string; color: string }>();
    categories?.forEach(cat => map.set(cat.id, { name: cat.name, color: cat.color }));
    return map;
  }, [categories]);

  // Prepare donut chart data - group expenses by category
  const categoryChartData = useMemo(() => {
    if (!allExpenses || !categories) return [];

    // Group expenses by category
    const expensesByCategory = allExpenses.reduce((acc, expense) => {
      const categoryId = expense.expense_categories.id;
      if (!acc[categoryId]) {
        acc[categoryId] = 0;
      }
      acc[categoryId] += expense.expenses.amount;
      return acc;
    }, {} as Record<number, number>);

    // Convert to array and add category names
    return Object.entries(expensesByCategory)
      .map(([categoryId, amount]) => {
        const categoryInfo = categoryMap.get(Number(categoryId));
        return {
          category: categoryInfo?.name || "Sem categoria",
          amount: Number(amount.toFixed(2)),
          fill: categoryInfo?.color || "hsl(var(--muted))"
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [allExpenses, categories, categoryMap]);

  const totalExpenses = useMemo(() => {
    return categoryChartData.reduce((sum, item) => sum + item.amount, 0);
  }, [categoryChartData]);

  // Chart configs
  const areaChartConfig = {
    cumulative: {
      label: "Gasto Acumulado",
      color: "hsl(var(--chart-1))",
    },
  } satisfies ChartConfig;

  const pieChartConfig = {
    amount: {
      label: "Valor",
    },
  } satisfies ChartConfig;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Checking Accounts</h1>
        
        <div className="flex gap-3">
          <CreateCategoryDialog />
          <CreateExpenseDialog />
        </div>
      </div>

      <div className="flex justify-end gap-4">
          <Select
            value={selectedAccount.toString()}
            onValueChange={(value) => setSelectedAccount(value === "all" ? "all" : Number(value))}
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
      

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Gastos</CardTitle>
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
            <CardTitle className="text-sm font-medium">Número de Transações</CardTitle>
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
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Evolução de Gastos</CardTitle>
            <CardDescription>Acumulado ao longo do período</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ChartContainer config={areaChartConfig} className="h-87.5 w-full">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="fillCumulative" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopOpacity={0.8}
                      />
                      <stop
                        offset="95%"
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
                          if (payload && payload[0]) {
                            const date = payload[0].payload.date;
                            return format(new Date(date), "dd/MM/yyyy", { locale: ptBR });
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
                    fillOpacity={0.4}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>
            ) : (
              <div className="flex items-center justify-center h-87.5 text-muted-foreground">
                Nenhum dado disponível para o período selecionado
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pie Chart - Gastos por Categoria */}
        <Card>
          <CardHeader>
            <CardTitle>Gastos por Categoria</CardTitle>
            <CardDescription>Distribuição de gastos por categoria</CardDescription>
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
                              <span className="font-medium">{item.payload.category}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-muted-foreground">Valor:</span>
                              <span className="font-bold">
                                {new Intl.NumberFormat("pt-BR", {
                                  style: "currency",
                                  currency: "BRL",
                                }).format(value as number)}
                              </span>
                              <span className="text-muted-foreground">
                                ({((value as number / totalExpenses) * 100).toFixed(1)}%)
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
                                className="text-3xl font-bold"
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
                                className="fill-muted-foreground"
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
              <div className="flex items-center justify-center h-87.5 text-muted-foreground">
                Nenhum dado disponível para o período selecionado
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Expenses Table */}
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
            <div className="flex items-center justify-center p-8 text-muted-foreground">
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allExpenses
                    .sort((a, b) => new Date(b.expenses.expenseDate).getTime() - new Date(a.expenses.expenseDate).getTime())
                    .map((expense) => (
                      <TableRow key={expense.expenses.id}>
                        <TableCell>
                          {format(new Date(expense.expenses.expenseDate), "dd/MM/yyyy", { locale: ptBR })}
                        </TableCell>
                        <TableCell>{expense.expenses.description || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" color={expense.expense_categories.color || "muted"}>
                            {categoryMap.get(expense.expense_categories.id)?.name || "Sem categoria"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {new Intl.NumberFormat("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          }).format(expense.expenses.amount)}
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
  );
}