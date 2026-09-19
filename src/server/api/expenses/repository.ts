import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { accounts, expenseCategories, expenses } from "~/server/db/schema";

/**
 * Every `YYYY-MM` the user has spending in, newest first. Feeds the month
 * picker so navigating the history is a jump rather than a hunt: months with no
 * expenses are simply not offered.
 *
 * `expense_date` is stored as `YYYY-MM-DD` text, so the month is a prefix.
 */
export async function getExpenseMonths(userId: string, accountId?: number) {
  const month = sql<string>`substr(${expenses.expenseDate}, 1, 7)`;
  const conditions = [eq(accounts.userId, userId)];
  if (accountId !== undefined) {
    conditions.push(eq(expenses.checkingAccountId, accountId));
  }

  const rows = await db
    .select({ month })
    .from(expenses)
    .innerJoin(accounts, eq(expenses.checkingAccountId, accounts.id))
    .where(and(...conditions))
    .groupBy(month)
    .orderBy(desc(month));

  return rows.map((row) => row.month);
}

/**
 * The columns the pages actually render, in the nested shape a bare joined
 * select used to produce. The join through `accounts` is only there to scope
 * by owner; its columns were shipped to the browser with every row and never
 * read, which for a whole period of spending was most of the payload.
 */
const expenseListColumns = {
  expenses: {
    id: expenses.id,
    amount: expenses.amount,
    categoryId: expenses.categoryId,
    description: expenses.description,
    expenseDate: expenses.expenseDate,
    checkingAccountId: expenses.checkingAccountId,
  },
  expense_categories: {
    id: expenseCategories.id,
    name: expenseCategories.name,
    color: expenseCategories.color,
  },
};

export function getAllExpensesByUser(
  userId: string,
  dateRange?: { startDate: string; endDate: string },
) {
  const conditions = [eq(accounts.userId, userId)];

  if (dateRange) {
    conditions.push(
      gte(expenses.expenseDate, dateRange.startDate),
      lte(expenses.expenseDate, dateRange.endDate),
    );
  }

  return db
    .select(expenseListColumns)
    .from(expenses)
    .innerJoin(accounts, eq(expenses.checkingAccountId, accounts.id))
    .innerJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .where(and(...conditions))
    .orderBy(desc(expenses.expenseDate));
}

/**
 * Per-month, per-category spending totals for a window.
 *
 * The dashboard used to answer this by fetching every expense row of three
 * overlapping windows (this month, last month, six months) and summing them in
 * the browser. This is one grouped scan instead, and it returns a grid of at
 * most `months × categories` rows rather than the whole ledger — the category
 * name and colour ride along so the page needs no second lookup.
 */
export async function getMonthlyExpenseSummary(
  userId: string,
  dateRange: { startDate: string; endDate: string },
) {
  // `expense_date` is stored as `YYYY-MM-DD` text, so the month is a prefix.
  const month = sql<string>`substr(${expenses.expenseDate}, 1, 7)`;

  return await db
    .select({
      month,
      categoryId: expenseCategories.id,
      categoryName: expenseCategories.name,
      categoryColor: expenseCategories.color,
      total: sql<number>`sum(${expenses.amount})`,
    })
    .from(expenses)
    .innerJoin(accounts, eq(expenses.checkingAccountId, accounts.id))
    .innerJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .where(
      and(
        eq(accounts.userId, userId),
        gte(expenses.expenseDate, dateRange.startDate),
        lte(expenses.expenseDate, dateRange.endDate),
      ),
    )
    .groupBy(month, expenseCategories.id)
    .orderBy(month);
}

/**
 * The newest `limit` expenses in a window. Ordering and slicing here rather
 * than in the browser keeps the payload to what is actually rendered.
 */
export async function getRecentExpenses(
  userId: string,
  dateRange: { startDate: string; endDate: string },
  limit: number,
) {
  return await db
    .select()
    .from(expenses)
    .innerJoin(accounts, eq(expenses.checkingAccountId, accounts.id))
    .innerJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .where(
      and(
        eq(accounts.userId, userId),
        gte(expenses.expenseDate, dateRange.startDate),
        lte(expenses.expenseDate, dateRange.endDate),
      ),
    )
    .orderBy(desc(expenses.expenseDate), desc(expenses.id))
    .limit(limit);
}

export function getAllExpensesByAccount(
  userId: string,
  accountId: number,
  dateRange?: { startDate: string; endDate: string },
) {
  const conditions = [
    eq(expenses.checkingAccountId, accountId),
    eq(accounts.userId, userId),
  ];

  if (dateRange) {
    conditions.push(
      gte(expenses.expenseDate, dateRange.startDate),
      lte(expenses.expenseDate, dateRange.endDate),
    );
  }

  return db
    .select(expenseListColumns)
    .from(expenses)
    .innerJoin(accounts, eq(expenses.checkingAccountId, accounts.id))
    .innerJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .where(and(...conditions))
    .orderBy(desc(expenses.expenseDate));
}

export function createExpense(input: {
  checkingAccountId: number;
  categoryId: number;
  description?: string;
  amount: number;
  expenseDate: string;
}) {
  return db
    .insert(expenses)
    .values({
      checkingAccountId: input.checkingAccountId,
      categoryId: input.categoryId,
      description: input.description,
      amount: input.amount,
      expenseDate: input.expenseDate,
    })
    .returning();
}

/**
 * True when the expense exists and hangs off an account owned by the user.
 * `expenses` has no `userId` of its own, so ownership is always resolved by
 * joining through `accounts` — every read or write taking an expense id from
 * the client must pass through here first.
 */
export async function ownsExpense(userId: string, expenseId: number) {
  const [row] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .innerJoin(accounts, eq(expenses.checkingAccountId, accounts.id))
    .where(and(eq(expenses.id, expenseId), eq(accounts.userId, userId)));
  return row !== undefined;
}

export function deleteExpense(expenseId: number) {
  return db.delete(expenses).where(eq(expenses.id, expenseId));
}

export function getExpenseById(expenseId: number) {
  return db
    .select()
    .from(expenses)
    .where(eq(expenses.id, expenseId))
    .limit(1)
    .then((rows) => rows[0]);
}

export function updateExpense(
  expenseId: number,
  input: {
    checkingAccountId?: number;
    categoryId?: number;
    description?: string;
    amount?: number;
    expenseDate?: string;
  },
) {
  return db
    .update(expenses)
    .set({
      checkingAccountId: input.checkingAccountId,
      categoryId: input.categoryId,
      description: input.description,
      amount: input.amount,
      expenseDate: input.expenseDate,
    })
    .where(eq(expenses.id, expenseId))
    .returning();
}
