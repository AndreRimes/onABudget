export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

/**
 * Text colour for a gain/loss figure. Goes through the --profit / --loss
 * tokens rather than hardcoded green-600 / red-600 so both themes stay
 * consistent and the colour can be tuned in one place.
 */
export function gainTone(value: number): string {
  return value >= 0 ? "text-profit" : "text-loss";
}

/** Signed currency, so a positive figure reads unambiguously as a gain. */
export function formatSignedCurrency(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatCurrency(value)}`;
}

export function formatSignedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatPercent(value)}`;
}
