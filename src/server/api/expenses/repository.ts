import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "~/server/db";
import { accounts, expenseCategories, expenses } from "~/server/db/schema";

export function getAllExpensesByUser(
  userId: string,
  dateRange?: { startDate: string; endDate: string },
) {
  const conditions = [eq(accounts.userId, userId)];

  if (dateRange) {
    conditions.push(gte(expenses.expenseDate, dateRange.startDate));
    conditions.push(lte(expenses.expenseDate, dateRange.endDate));
  }

  return db
    .select()
    .from(expenses)
    .innerJoin(accounts, eq(expenses.checkingAccountId, accounts.id))
    .innerJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .where(and(...conditions))
    .orderBy(desc(expenses.expenseDate));
}

export function getAllExpensesByAccount(
  accountId: number,
  dateRange?: { startDate: string; endDate: string },
) {
  const conditions = [eq(expenses.checkingAccountId, accountId)];

  if (dateRange) {
    conditions.push(gte(expenses.expenseDate, dateRange.startDate));
    conditions.push(lte(expenses.expenseDate, dateRange.endDate));
  }

  return db
    .select()
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
