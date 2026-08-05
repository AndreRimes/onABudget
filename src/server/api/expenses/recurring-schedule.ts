// Pure scheduling logic for recurring expenses: which occurrences of a rule
// are due, and on what date. Kept free of any database import so it can be
// reasoned about (and exercised) on its own.

export interface RecurringSchedule {
  id: number;
  dayOfMonth: number;
  startMonth: string; // YYYY-MM
  endMonth: string | null; // YYYY-MM inclusive, null = open-ended
}

export interface DueOccurrence {
  month: string; // YYYY-MM
  date: string; // YYYY-MM-DD, day clamped to the month's length
  hash: string; // recurring:{ruleId}:{YYYY-MM}
}

/** Days in a given 1-indexed month, so day 31 still posts in February. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** All `YYYY-MM` from `start` to `end` inclusive; empty if start is after end. */
export function monthsBetween(start: string, end: string): string[] {
  const months: string[] = [];
  const [startYear, startMonth] = start.split("-").map(Number);
  const [endYear, endMonth] = end.split("-").map(Number);
  if (!startYear || !startMonth || !endYear || !endMonth) return months;

  let year = startYear;
  let month = startMonth;
  // A rule with a far-past startMonth must not be able to spin forever.
  for (let guard = 0; guard < 600; guard++) {
    if (year > endYear || (year === endYear && month > endMonth)) break;
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return months;
}

/**
 * Every occurrence of a rule that should already exist as of `todayIso`.
 *
 * The current month's occurrence only counts once its day has arrived, so a
 * rule due on the 28th doesn't post on the 3rd.
 */
export function dueOccurrences(
  rule: RecurringSchedule,
  todayIso: string,
): DueOccurrence[] {
  const currentMonth = todayIso.slice(0, 7);
  const lastMonth =
    rule.endMonth && rule.endMonth < currentMonth ? rule.endMonth : currentMonth;
  if (rule.startMonth > lastMonth) return [];

  const occurrences: DueOccurrence[] = [];
  for (const month of monthsBetween(rule.startMonth, lastMonth)) {
    const [year, monthNumber] = month.split("-").map(Number);
    if (!year || !monthNumber) continue;
    const day = Math.min(
      Math.max(rule.dayOfMonth, 1),
      daysInMonth(year, monthNumber),
    );
    const date = `${month}-${String(day).padStart(2, "0")}`;
    if (date > todayIso) continue;
    occurrences.push({ month, date, hash: `recurring:${rule.id}:${month}` });
  }
  return occurrences;
}
