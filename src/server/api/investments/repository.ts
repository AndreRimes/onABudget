import { eq, desc, and, between, inArray } from "drizzle-orm";
import { db } from "~/server/db";
import {
  investmentTransactions,
  accounts,
  assetTypes,
  dividends,
} from "~/server/db/schema";
import { marketCacheService, todayIso } from "~/server/services/market-cache";
import { dividendRepository } from "../dividends/repository";
import {
  computePortfolioSnapshot,
  type PortfolioSnapshot,
  type TimeRange,
} from "./portfolio-engine";

export type InvestmentTransactionInsert =
  typeof investmentTransactions.$inferInsert;
export type InvestmentTransaction = typeof investmentTransactions.$inferSelect;

export type CreateInvestmentInput = {
  investmentAccountId: number;
  assetTypeId: number;
  assetName: string;
  transactionType: "BUY" | "SELL";
  quantity: number;
  pricePerUnit: number;
  totalAmount: number;
  transactionDate: string;
  isFixedIncome?: boolean;
  fixedIncomeYieldType?: "CDI_PERCENTAGE" | "PREFIXED" | null;
  fixedIncomeRate?: number | null;
  fixedIncomeMaturityDate?: string | null;
};

const transactionColumns = {
  id: investmentTransactions.id,
  investmentAccountId: investmentTransactions.investmentAccountId,
  assetTypeId: investmentTransactions.assetTypeId,
  assetName: investmentTransactions.assetName,
  transactionType: investmentTransactions.transactionType,
  quantity: investmentTransactions.quantity,
  pricePerUnit: investmentTransactions.pricePerUnit,
  totalAmount: investmentTransactions.totalAmount,
  transactionDate: investmentTransactions.transactionDate,
  createdAt: investmentTransactions.createdAt,
  isFixedIncome: investmentTransactions.isFixedIncome,
  fixedIncomeYieldType: investmentTransactions.fixedIncomeYieldType,
  fixedIncomeRate: investmentTransactions.fixedIncomeRate,
  fixedIncomeMaturityDate: investmentTransactions.fixedIncomeMaturityDate,
  sourceHash: investmentTransactions.sourceHash,
};

export class InvestmentRepository {
  async create(values: CreateInvestmentInput): Promise<InvestmentTransaction> {
    const [transaction] = await db
      .insert(investmentTransactions)
      .values(values)
      .returning();

    return transaction!;
  }

  /**
   * Get all transactions for a specific user across all their investment accounts
   */
  async findByUserId(userId: string): Promise<InvestmentTransaction[]> {
    return await db
      .select(transactionColumns)
      .from(investmentTransactions)
      .innerJoin(
        accounts,
        eq(investmentTransactions.investmentAccountId, accounts.id),
      )
      .where(eq(accounts.userId, userId))
      .orderBy(desc(investmentTransactions.transactionDate));
  }

  async findByAssetName(
    userId: string,
    assetName: string,
  ): Promise<InvestmentTransaction[]> {
    return await db
      .select(transactionColumns)
      .from(investmentTransactions)
      .innerJoin(
        accounts,
        eq(investmentTransactions.investmentAccountId, accounts.id),
      )
      .where(
        and(
          eq(accounts.userId, userId),
          eq(investmentTransactions.assetName, assetName),
        ),
      )
      .orderBy(desc(investmentTransactions.transactionDate));
  }

  async findByDateRange(
    userId: string,
    startDate: string,
    endDate: string,
  ): Promise<InvestmentTransaction[]> {
    return await db
      .select(transactionColumns)
      .from(investmentTransactions)
      .innerJoin(
        accounts,
        eq(investmentTransactions.investmentAccountId, accounts.id),
      )
      .where(
        and(
          eq(accounts.userId, userId),
          between(investmentTransactions.transactionDate, startDate, endDate),
        ),
      )
      .orderBy(desc(investmentTransactions.transactionDate));
  }

  async update(
    id: number,
    values: Partial<CreateInvestmentInput>,
  ): Promise<InvestmentTransaction | undefined> {
    const [updated] = await db
      .update(investmentTransactions)
      .set(values)
      .where(eq(investmentTransactions.id, id))
      .returning();

    return updated;
  }

  async delete(id: number): Promise<boolean> {
    const result = await db
      .delete(investmentTransactions)
      .where(eq(investmentTransactions.id, id))
      .returning();

    return result.length > 0;
  }

  /**
   * Remove an asset entirely: every transaction and dividend the user has
   * registered under that ticker.
   */
  async deleteByAssetName(
    userId: string,
    assetName: string,
  ): Promise<{ transactionsDeleted: number; dividendsDeleted: number }> {
    const userAccounts = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.userId, userId));
    const accountIds = userAccounts.map((account) => account.id);
    if (accountIds.length === 0) {
      return { transactionsDeleted: 0, dividendsDeleted: 0 };
    }

    const deletedTransactions = await db
      .delete(investmentTransactions)
      .where(
        and(
          inArray(investmentTransactions.investmentAccountId, accountIds),
          eq(investmentTransactions.assetName, assetName),
        ),
      )
      .returning({ id: investmentTransactions.id });

    const deletedDividends = await db
      .delete(dividends)
      .where(
        and(
          inArray(dividends.investmentAccountId, accountIds),
          eq(dividends.assetName, assetName),
        ),
      )
      .returning({ id: dividends.id });

    return {
      transactionsDeleted: deletedTransactions.length,
      dividendsDeleted: deletedDividends.length,
    };
  }

  /**
   * Single source of truth for the investments page: holdings, summary and
   * chart series computed in one pass over the same market data.
   */
  async getPortfolioSnapshot(
    userId: string,
    range: TimeRange = "max",
    includeSeries = true,
  ): Promise<PortfolioSnapshot> {
    const [transactions, userDividends, allAssetTypes] = await Promise.all([
      this.findByUserId(userId),
      dividendRepository.findByUserId(userId),
      db.select().from(assetTypes),
    ]);

    // Net quantity per asset, to know which market symbols need quotes.
    const netQuantity = new Map<string, { quantity: number; fixed: boolean }>();
    for (const tx of transactions) {
      const entry = netQuantity.get(tx.assetName) ?? {
        quantity: 0,
        fixed: tx.isFixedIncome ?? false,
      };
      entry.quantity +=
        tx.transactionType === "BUY" ? tx.quantity : -tx.quantity;
      netQuantity.set(tx.assetName, entry);
    }
    const activeMarketSymbols = [...netQuantity.entries()]
      .filter(([, entry]) => entry.quantity > 1e-9 && !entry.fixed)
      .map(([assetName]) => assetName);

    const today = todayIso();
    const fullStart = transactions.reduce(
      (earliest, tx) =>
        tx.transactionDate.slice(0, 10) < earliest
          ? tx.transactionDate.slice(0, 10)
          : earliest,
      today,
    );

    const [quotes, candles, cdiRates] = await Promise.all([
      marketCacheService.getQuotes(activeMarketSymbols),
      marketCacheService.getCandles(activeMarketSymbols, fullStart),
      marketCacheService.getCdiRates(fullStart),
    ]);

    return computePortfolioSnapshot({
      transactions: transactions.map((tx) => ({
        assetName: tx.assetName,
        assetTypeId: tx.assetTypeId,
        transactionType: tx.transactionType,
        quantity: tx.quantity,
        totalAmount: tx.totalAmount,
        transactionDate: tx.transactionDate.slice(0, 10),
        isFixedIncome: tx.isFixedIncome ?? false,
        fixedIncomeYieldType: tx.fixedIncomeYieldType,
        fixedIncomeRate: tx.fixedIncomeRate,
        fixedIncomeMaturityDate: tx.fixedIncomeMaturityDate,
      })),
      dividends: userDividends.map((dividend) => ({
        assetName: dividend.assetName,
        amount: dividend.amount,
        paymentDate: dividend.paymentDate,
      })),
      assetTypeNames: new Map(
        allAssetTypes.map((type) => [type.id, type.name]),
      ),
      quotes,
      candles,
      cdiRates,
      range,
      today,
      includeSeries,
    });
  }
}

export const investmentRepository = new InvestmentRepository();
