/**
 * Series colours shared across charts, so a quantity keeps one identity
 * wherever it is drawn. The values live in `globals.css`, stepped per theme —
 * never hardcode a hex at the call site.
 */

/** Spending. The palette's spare slot, kept clear of the cash/portfolio hues. */
export const SPEND_COLOR = "var(--chart-5)";

/** Cash in checking accounts. */
export const CASH_COLOR = "var(--chart-1)";

/** The investment portfolio's own series. */
export const INVESTMENT_COLOR = "var(--chart-portfolio)";
