import { and, eq } from "drizzle-orm";
import { db } from "~/server/db";
import { accounts } from "~/server/db/schema";

export type CreateAccountInput = {
  userId: string;
  name: string;
  accountType: "CHECKING" | "INVESTMENT";
  balance?: number;
};

export type UpdateAccountInput = {
  id: number;
  userId: string;
  accountType?: "CHECKING" | "INVESTMENT";
  balance?: number;
  name?: string;
};

export const accountRepository = {
  create: async (input: CreateAccountInput) => {
    const [newAccount] = await db
      .insert(accounts)
      .values({
        userId: input.userId,
        name: input.name,
        accountType: input.accountType,
        balance: input.balance ?? 0,
      })
      .returning();
    return newAccount;
  },

  findByUserId: async (userId: string) => {
    return await db.select().from(accounts).where(eq(accounts.userId, userId));
  },

  findById: async (id: number, userId: string) => {
    const [account] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
    return account;
  },

  update: async (input: UpdateAccountInput) => {
    const updateData: Partial<typeof accounts.$inferInsert> = {};

    if (input.accountType !== undefined)
      updateData.accountType = input.accountType;
    if (input.balance !== undefined) updateData.balance = input.balance;
    if (input.name !== undefined) updateData.name = input.name;

    const [updatedAccount] = await db
      .update(accounts)
      .set(updateData)
      .where(and(eq(accounts.id, input.id), eq(accounts.userId, input.userId)))
      .returning();

    return updatedAccount;
  },

  delete: async (id: number, userId: string) => {
    const [deletedAccount] = await db
      .delete(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
      .returning();
    return deletedAccount;
  },
};
