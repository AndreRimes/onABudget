import { and, eq, lte, gte, desc, or, isNull } from "drizzle-orm";
import { db } from "~/server/db";
import { budget } from "~/server/db/schema";

export type CreateBudgetInput = {
  userId: string;
  amount: number;
  startPeriod: string;
  endPeriod?: string;
};

export type UpdateBudgetInput = {
  id: number;
  amount?: number;
  startPeriod?: string;
  endPeriod?: string;
};

export const budgetRepository = {
  create: async (input: CreateBudgetInput) => {
    const [latestOpen] = await db
      .select()
      .from(budget)
      .where(
        and(eq(budget.userId, input.userId), isNull(budget.endPeriod)),
      )
      .orderBy(desc(budget.startPeriod))
      .limit(1);

    if (latestOpen) {
      await db
        .update(budget)
        .set({ endPeriod: input.startPeriod })
        .where(eq(budget.id, latestOpen.id));
    }

    const [newBudget] = await db
      .insert(budget)
      .values({
        userId: input.userId,
        amount: input.amount,
        startPeriod: input.startPeriod,
        endPeriod: input.endPeriod,
      })
      .returning();
    return newBudget;
  },

  findByUserId: async (userId: string) => {
    return await db
      .select()
      .from(budget)
      .where(eq(budget.userId, userId))
      .orderBy(desc(budget.startPeriod));
  },

  findById: async (id: number) => {
    const [result] = await db
      .select()
      .from(budget)
      .where(eq(budget.id, id));
    return result;
  },

  /**
   * Find the active budget for a given date (budget whose period contains the date)
   */
  findActiveForDate: async (userId: string, date: string) => {
    const [result] = await db
      .select()
      .from(budget)
      .where(
        and(
          eq(budget.userId, userId),
          lte(budget.startPeriod, date),
          or(gte(budget.endPeriod, date), isNull(budget.endPeriod)),
        ),
      )
      .orderBy(desc(budget.startPeriod))
      .limit(1);
    return result;
  },

  /**
   * Get the latest/current budget for a user
   */
  findLatest: async (userId: string) => {
    const [result] = await db
      .select()
      .from(budget)
      .where(eq(budget.userId, userId))
      .orderBy(desc(budget.startPeriod))
      .limit(1);
    return result;
  },

  update: async (input: UpdateBudgetInput) => {
    const updateData: Partial<typeof budget.$inferInsert> = {};

    if (input.amount !== undefined) updateData.amount = input.amount;
    if (input.startPeriod !== undefined) updateData.startPeriod = input.startPeriod;
    if (input.endPeriod !== undefined) updateData.endPeriod = input.endPeriod;

    const [updated] = await db
      .update(budget)
      .set(updateData)
      .where(eq(budget.id, input.id))
      .returning();
    return updated;
  },

  delete: async (id: number) => {
    const [deleted] = await db
      .delete(budget)
      .where(eq(budget.id, id))
      .returning();
    return deleted;
  },
};
