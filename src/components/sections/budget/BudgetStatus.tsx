import { formatCurrency } from "~/lib/format";

/**
 * Spending measured against a budget: used percentage, over/under stamp and a
 * progress bar. `budgetAmount` is whatever the caller considers the budget
 * for the period on screen (a monthly figure, or one scaled to several months).
 */
export function BudgetStatus({
  budgetAmount,
  spent,
}: {
  budgetAmount: number;
  spent: number;
}) {
  if (budgetAmount <= 0) {
    return (
      <div className="text-muted-foreground space-y-1">
        <p className="text-sm">Nenhum orçamento definido</p>
        <p className="text-xs">Clique no ícone acima para definir</p>
      </div>
    );
  }
  const usedPercent = (spent / budgetAmount) * 100;
  const isOverBudget = spent > budgetAmount;
  const remaining = budgetAmount - spent;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-bold">{usedPercent.toFixed(0)}%</span>
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
      {/* Progress bar */}
      <div className="border-foreground bg-muted h-3 w-full overflow-hidden border-2">
        <div
          className={`h-full transition-all ${
            isOverBudget ? "bg-loss" : "bg-profit"
          }`}
          style={{ width: `${Math.min(usedPercent, 100)}%` }}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        {isOverBudget
          ? `${formatCurrency(Math.abs(remaining))} acima do orçamento`
          : `${formatCurrency(remaining)} restantes de ${formatCurrency(budgetAmount)}`}
      </p>
    </div>
  );
}
