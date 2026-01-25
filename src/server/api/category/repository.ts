import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { expenseCategories } from "~/server/db/schema";

export type CreateCategoryInput = {
  name: string;
  description?: string;
  color: string;
};

export type UpdateCategoryInput = {
  id: number;
  name?: string;
  description?: string;
};

export const categoryRepository = {
  create: async (input: CreateCategoryInput) => {
    const [newCategory] = await db
      .insert(expenseCategories)
      .values({
        name: input.name,
        color: input.color,
        description: input.description,
      })
      .returning();
    return newCategory;
  },

  findAll: async () => {
    return await db.select().from(expenseCategories);
  },

  findById: async (id: number) => {
    const [category] = await db
      .select()
      .from(expenseCategories)
      .where(eq(expenseCategories.id, id));
    return category;
  },

  update: async (input: UpdateCategoryInput) => {
    const updateData: Partial<typeof expenseCategories.$inferInsert> = {};

    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined)
      updateData.description = input.description;

    const [updatedCategory] = await db
      .update(expenseCategories)
      .set(updateData)
      .where(eq(expenseCategories.id, input.id))
      .returning();

    return updatedCategory;
  },

  delete: async (id: number) => {
    const [deletedCategory] = await db
      .delete(expenseCategories)
      .where(eq(expenseCategories.id, id))
      .returning();
    return deletedCategory;
  },
};
