import { and, eq, inArray } from "drizzle-orm";
import type { AccountType } from "~/lib/account-type";
import { SPENDING_ACCOUNT_TYPES } from "~/lib/account-type";
import { db } from "~/server/db";
import { accounts } from "~/server/db/schema";

export type CreateAccountInput = {
  userId: string;
  name: string;
  accountType: AccountType;
  balance?: number;
};

export type UpdateAccountInput = {
  id: number;
  userId: string;
  accountType?: AccountType;
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

  /**
   * True when the account exists, belongs to the user and can hold
   * investments. Any write that accepts an `investmentAccountId` from the
   * client must pass through here — otherwise an authenticated user can file
   * transactions or dividends into someone else's account by guessing an id.
   */
  ownsInvestmentAccount: async (userId: string, accountId: number) => {
    return await ownsAccountOfType(userId, accountId, "INVESTMENT");
  },

  /**
   * Spending-account counterpart of `ownsInvestmentAccount`: true for a
   * checking account or a credit card the user owns. Every write that takes an
   * expense's account id from the client — including the bulk statement and
   * fatura imports — must pass through here.
   */
  ownsSpendingAccount: async (userId: string, accountId: number) => {
    const [account] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.id, accountId),
          eq(accounts.userId, userId),
          inArray(accounts.accountType, [...SPENDING_ACCOUNT_TYPES]),
        ),
      );
    return account !== undefined;
  },

  /** All accounts of the user that can hold expenses. */
  findSpendingAccounts: async (userId: string) => {
    return await db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, userId),
          inArray(accounts.accountType, [...SPENDING_ACCOUNT_TYPES]),
        ),
      );
  },
};

async function ownsAccountOfType(
  userId: string,
  accountId: number,
  accountType: AccountType,
) {
  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.id, accountId),
        eq(accounts.userId, userId),
        eq(accounts.accountType, accountType),
      ),
    );
  return account !== undefined;
}
