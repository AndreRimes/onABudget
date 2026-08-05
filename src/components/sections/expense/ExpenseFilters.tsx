"use client";

// The expense page's filter bar and the state behind it.
//
// The period model here is deliberately absolute (a month, a year) rather than
// relative ("last 3 months"). A rolling window mixes parts of several months
// into one number, which cannot be compared against a monthly budget and cannot
// be revisited — there is no way to ask "what did I spend in March?". A month
// with arrows either side answers that in one click.
import {
  addMonths,
  endOfMonth,
  endOfYear,
  format,
  parseISO,
  startOfMonth,
  startOfYear,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

export type PeriodMode = "month" | "year" | "all";

export type SortKey = "date-desc" | "date-asc" | "amount-desc" | "amount-asc";

export interface ExpenseFilterState {
  mode: PeriodMode;
  /** Anchor for `month` mode, as `YYYY-MM`. Kept while other modes are active. */
  month: string;
  /** Anchor for `year` mode. */
  year: number;
  accountId: number | "all";
  /** Empty means every category — the common case, so no chip is shown. */
  categoryIds: number[];
  search: string;
  sort: SortKey;
}

export function currentMonthKey(): string {
  return format(new Date(), "yyyy-MM");
}

export function defaultExpenseFilters(): ExpenseFilterState {
  return {
    mode: "month",
    month: currentMonthKey(),
    year: new Date().getFullYear(),
    accountId: "all",
    categoryIds: [],
    search: "",
    sort: "date-desc",
  };
}

/** `undefined` means "no date bound", which is what the router expects. */
export function periodRange(
  filters: ExpenseFilterState,
): { startDate: string; endDate: string } | undefined {
  if (filters.mode === "month") {
    const anchor = parseISO(`${filters.month}-01`);
    return {
      startDate: format(startOfMonth(anchor), "yyyy-MM-dd"),
      endDate: format(endOfMonth(anchor), "yyyy-MM-dd"),
    };
  }
  if (filters.mode === "year") {
    const anchor = new Date(filters.year, 0, 1);
    return {
      startDate: format(startOfYear(anchor), "yyyy-MM-dd"),
      endDate: format(endOfYear(anchor), "yyyy-MM-dd"),
    };
  }
  return undefined;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function monthLabel(month: string): string {
  return capitalize(
    format(parseISO(`${month}-01`), "MMMM 'de' yyyy", { locale: ptBR }),
  );
}

export function periodLabel(filters: ExpenseFilterState): string {
  if (filters.mode === "month") return monthLabel(filters.month);
  if (filters.mode === "year") return String(filters.year);
  return "Todo o período";
}

/**
 * How many months the selected period covers, used to scale a *monthly* budget
 * to the range on screen. For the running year that is the months elapsed, not
 * twelve — comparing eight months of spending against a twelve-month budget
 * would always look comfortable.
 */
export function monthsInPeriod(
  filters: ExpenseFilterState,
  distinctMonthsWithData: number,
): number {
  if (filters.mode === "month") return 1;
  if (filters.mode === "year") {
    const now = new Date();
    return filters.year === now.getFullYear() ? now.getMonth() + 1 : 12;
  }
  return Math.max(distinctMonthsWithData, 1);
}

/** Steps the anchor one month/year back or forward. No-op in `all` mode. */
export function shiftPeriod(
  filters: ExpenseFilterState,
  delta: number,
): ExpenseFilterState {
  if (filters.mode === "month") {
    const shifted = addMonths(parseISO(`${filters.month}-01`), delta);
    return { ...filters, month: format(shifted, "yyyy-MM") };
  }
  if (filters.mode === "year") {
    return { ...filters, year: filters.year + delta };
  }
  return filters;
}

/**
 * Changes the period granularity, carrying the anchor across so the user stays
 * roughly where they were: zooming out from October 2025 lands on 2025, not on
 * the current year.
 */
function switchMode(
  filters: ExpenseFilterState,
  mode: PeriodMode,
): Partial<ExpenseFilterState> {
  if (mode === "year" && filters.mode === "month") {
    return { mode, year: Number(filters.month.slice(0, 4)) };
  }
  if (mode === "month" && filters.mode === "year") {
    const current = currentMonthKey();
    return {
      mode,
      month:
        filters.year === new Date().getFullYear()
          ? current
          : `${filters.year}-12`,
    };
  }
  return { mode };
}

/** True when anything beyond the default period selection is narrowing the list. */
export function hasNarrowingFilters(filters: ExpenseFilterState): boolean {
  return (
    filters.accountId !== "all" ||
    filters.categoryIds.length > 0 ||
    filters.search.trim() !== ""
  );
}

interface ExpenseFiltersProps {
  value: ExpenseFilterState;
  onChange: (next: ExpenseFilterState) => void;
  accounts: Array<{ id: number; name: string }>;
  categories: Array<{ id: number; name: string; color: string }>;
  /** `YYYY-MM` keys that actually have expenses, newest first. */
  months: string[];
}

export function ExpenseFilters({
  value,
  onChange,
  accounts,
  categories,
  months,
}: ExpenseFiltersProps) {
  const patch = (partial: Partial<ExpenseFilterState>) =>
    onChange({ ...value, ...partial });

  // The picker must always offer where the user currently is and where they
  // started, even if neither month has any spending yet.
  const monthOptions = Array.from(
    new Set([...months, value.month, currentMonthKey()]),
  ).sort((a, b) => b.localeCompare(a));

  const yearOptions = Array.from(
    new Set([
      ...months.map((month) => Number(month.slice(0, 4))),
      value.year,
      new Date().getFullYear(),
    ]),
  ).sort((a, b) => b - a);

  const selectedCategories = new Set(value.categoryIds);

  const toggleCategory = (id: number) => {
    patch({
      categoryIds: selectedCategories.has(id)
        ? value.categoryIds.filter((c) => c !== id)
        : [...value.categoryIds, id],
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Period navigator: arrows for stepping, the select for jumping. */}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          disabled={value.mode === "all"}
          onClick={() => onChange(shiftPeriod(value, -1))}
          aria-label="Período anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {value.mode === "month" && (
          <Select
            value={value.month}
            onValueChange={(month) => patch({ month })}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((month) => (
                <SelectItem key={month} value={month}>
                  {monthLabel(month)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {value.mode === "year" && (
          <Select
            value={String(value.year)}
            onValueChange={(year) => patch({ year: Number(year) })}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {value.mode === "all" && (
          <div className="text-muted-foreground flex h-9 w-56 items-center justify-center rounded-md border px-3 text-sm">
            Todo o período
          </div>
        )}

        <Button
          variant="outline"
          size="icon"
          disabled={value.mode === "all"}
          onClick={() => onChange(shiftPeriod(value, 1))}
          aria-label="Próximo período"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <Select
        value={value.mode}
        onValueChange={(mode) => patch(switchMode(value, mode as PeriodMode))}
      >
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="month">Por mês</SelectItem>
          <SelectItem value="year">Por ano</SelectItem>
          <SelectItem value="all">Tudo</SelectItem>
        </SelectContent>
      </Select>

      {value.mode !== "month" && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => patch({ mode: "month", month: currentMonthKey() })}
        >
          Mês atual
        </Button>
      )}

      <div className="flex-1" />

      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
        <Input
          className="w-52 pl-8"
          placeholder="Buscar descrição..."
          value={value.search}
          onChange={(event) => patch({ search: event.target.value })}
        />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2">
            Categorias
            {value.categoryIds.length > 0 && (
              <Badge variant="secondary">{value.categoryIds.length}</Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              patch({ categoryIds: [] });
            }}
          >
            Todas as categorias
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {categories.map((category) => (
            <DropdownMenuCheckboxItem
              key={category.id}
              checked={selectedCategories.has(category.id)}
              // Keep the menu open so several categories can be picked at once.
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={() => toggleCategory(category.id)}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: category.color }}
              />
              {category.name}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Select
        value={value.accountId === "all" ? "all" : String(value.accountId)}
        onValueChange={(accountId) =>
          patch({ accountId: accountId === "all" ? "all" : Number(accountId) })
        }
      >
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Conta" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as contas</SelectItem>
          {accounts.map((account) => (
            <SelectItem key={account.id} value={String(account.id)}>
              {account.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.sort}
        onValueChange={(sort) => patch({ sort: sort as SortKey })}
      >
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="date-desc">Mais recentes</SelectItem>
          <SelectItem value="date-asc">Mais antigas</SelectItem>
          <SelectItem value="amount-desc">Maior valor</SelectItem>
          <SelectItem value="amount-asc">Menor valor</SelectItem>
        </SelectContent>
      </Select>

      {hasNarrowingFilters(value) && (
        <Button
          variant="ghost"
          size="sm"
          className="gap-1"
          onClick={() =>
            patch({ accountId: "all", categoryIds: [], search: "" })
          }
        >
          <X className="h-4 w-4" />
          Limpar
        </Button>
      )}
    </div>
  );
}
