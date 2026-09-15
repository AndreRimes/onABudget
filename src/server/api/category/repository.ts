// Every method is scoped by owner. Categories were global until the per-user
// migration (0014); an unscoped read here is not a missing filter but a leak of
// one user's list into another's, so `userId` is a required first argument
// rather than an option.
import { and, eq, inArray } from "drizzle-orm";
import { db } from "~/server/db";
import { expenseCategories } from "~/server/db/schema";

export type CreateCategoryInput = {
  userId: string;
  name: string;
  description?: string;
  color: string;
};

export type UpdateCategoryInput = {
  id: number;
  userId: string;
  name?: string;
  description?: string;
};

export const categoryRepository = {
  create: async (input: CreateCategoryInput) => {
    const [newCategory] = await db
      .insert(expenseCategories)
      .values({
        userId: input.userId,
        name: input.name,
        color: input.color,
        description: input.description,
      })
      .returning();
    return newCategory;
  },

  findAll: async (userId: string) => {
    return await db
      .select()
      .from(expenseCategories)
      .where(eq(expenseCategories.userId, userId))
      .orderBy(expenseCategories.name);
  },

  findById: async (userId: string, id: number) => {
    const [category] = await db
      .select()
      .from(expenseCategories)
      .where(
        and(eq(expenseCategories.id, id), eq(expenseCategories.userId, userId)),
      );
    return category;
  },

  findByName: async (userId: string, name: string) => {
    const [category] = await db
      .select()
      .from(expenseCategories)
      .where(
        and(
          eq(expenseCategories.name, name),
          eq(expenseCategories.userId, userId),
        ),
      );
    return category;
  },

  /**
   * True when every id belongs to the user. Categories are per-owner, so a
   * write that takes a `categoryId` from the client must pass through here —
   * otherwise an expense can be filed under someone else's category, which
   * both leaks that category's name into the caller's lists and blocks its
   * owner from ever deleting it (the FK has no cascade).
   */
  ownsAll: async (userId: string, ids: number[]) => {
    const wanted = [...new Set(ids)];
    if (wanted.length === 0) return true;
    const rows = await db
      .select({ id: expenseCategories.id })
      .from(expenseCategories)
      .where(
        and(
          eq(expenseCategories.userId, userId),
          inArray(expenseCategories.id, wanted),
        ),
      );
    return rows.length === wanted.length;
  },

  update: async (input: UpdateCategoryInput) => {
    const updateData: Partial<typeof expenseCategories.$inferInsert> = {};

    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined)
      updateData.description = input.description;

    // The owner predicate lives in the WHERE rather than in a prior read: a
    // check-then-write would leave a window where the row changes hands, and
    // an empty `returning()` already means "not yours, or not there".
    const [updatedCategory] = await db
      .update(expenseCategories)
      .set(updateData)
      .where(
        and(
          eq(expenseCategories.id, input.id),
          eq(expenseCategories.userId, input.userId),
        ),
      )
      .returning();

    return updatedCategory;
  },

  delete: async (userId: string, id: number) => {
    const [deletedCategory] = await db
      .delete(expenseCategories)
      .where(
        and(eq(expenseCategories.id, id), eq(expenseCategories.userId, userId)),
      )
      .returning();
    return deletedCategory;
  },
};
