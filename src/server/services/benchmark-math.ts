// Normalisation of the benchmark providers' wildly different shapes into one
// thing: a decimal return per calendar date. Pure — no DB, no HTTP — so the
// conversions can be exercised directly, same reasoning as portfolio-engine.ts.
import type { CandlePoint } from "./brapi";

export interface DailyReturn {
  date: string; // YYYY-MM-DD
  dailyReturn: number; // decimal, e.g. 0.0031
}

/**
 * Index prices -> day-over-day returns. The first point has no predecessor so
 * it yields no return; that day simply has no accrual, exactly like a date the
 * CDI series doesn't cover.
 */
export function pricesToDailyReturns(closes: CandlePoint[]): DailyReturn[] {
  const out: DailyReturn[] = [];
  for (let i = 1; i < closes.length; i++) {
    const previous = closes[i - 1]!.close;
    const current = closes[i]!.close;
    if (previous <= 0) continue;
    out.push({ date: closes[i]!.date, dailyReturn: current / previous - 1 });
  }
  return out;
}

/**
 * A monthly print (IPCA, poupança) spread pro rata die across that month's
 * calendar days, compounding back to exactly the published monthly figure.
 *
 * Unlike CDI these accrue on weekends too — inflation doesn't pause on Sunday.
 * Months with no print yet (IPCA is published with a lag) contribute nothing,
 * so the line goes flat at the right edge rather than guessing a value.
 */
export function monthlyRatesToDailyReturns(
  months: Array<{ month: string; monthlyRate: number }>,
  endDate: string,
): DailyReturn[] {
  const out: DailyReturn[] = [];

  for (const { month, monthlyRate } of months) {
    const [year, monthNumber] = month.split("-").map(Number);
    if (!year || !monthNumber) continue;

    // Day 0 of the next month is the last day of this one.
    const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const dailyReturn = Math.pow(1 + monthlyRate, 1 / daysInMonth) - 1;

    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${month}-${String(day).padStart(2, "0")}`;
      if (date > endDate) break;
      out.push({ date, dailyReturn });
    }
  }

  return out;
}
