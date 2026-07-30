import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "~/server/db";
import { accounts, dividends } from "~/server/db/schema";

export type DividendInsert = typeof dividends.$inferInsert;
export type Dividend = typeof dividends.$inferSelect;

export class DividendRepository {
  async create(values: DividendInsert): Promise<Dividend> {
    const [created] = await db.insert(dividends).values(values).returning();
    return created!;
  }

  async findByUserId(userId: string): Promise<Dividend[]> {
    return await db
      .select({
        id: dividends.id,
        investmentAccountId: dividends.investmentAccountId,
        assetName: dividends.assetName,
        type: dividends.type,
        amount: dividends.amount,
        paymentDate: dividends.paymentDate,
        source: dividends.source,
        sourceHash: dividends.sourceHash,
        createdAt: dividends.createdAt,
      })
      .from(dividends)
      .innerJoin(accounts, eq(dividends.investmentAccountId, accounts.id))
      .where(eq(accounts.userId, userId))
      .orderBy(desc(dividends.paymentDate));
  }

  async findByAssetName(userId: string, assetName: string): Promise<Dividend[]> {
    return await db
      .select({
        id: dividends.id,
        investmentAccountId: dividends.investmentAccountId,
        assetName: dividends.assetName,
        type: dividends.type,
        amount: dividends.amount,
        paymentDate: dividends.paymentDate,
        source: dividends.source,
        sourceHash: dividends.sourceHash,
        createdAt: dividends.createdAt,
      })
      .from(dividends)
      .innerJoin(accounts, eq(dividends.investmentAccountId, accounts.id))
      .where(and(eq(accounts.userId, userId), eq(dividends.assetName, assetName)))
      .orderBy(desc(dividends.paymentDate));
  }

  /**
   * Scoped by the user's accounts: a guessed id belonging to someone else
   * matches no rows and reports false rather than deleting.
   */
  async delete(userId: string, id: number): Promise<boolean> {
    const userAccounts = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.userId, userId));
    const accountIds = userAccounts.map((account) => account.id);
    if (accountIds.length === 0) return false;

    const result = await db
      .delete(dividends)
      .where(
        and(
          eq(dividends.id, id),
          inArray(dividends.investmentAccountId, accountIds),
        ),
      )
      .returning();
    return result.length > 0;
  }
}

export const dividendRepository = new DividendRepository();
