// src/server/repositories/investment.repository.ts
import { eq, desc, and, sql, between } from "drizzle-orm";
import { db } from "~/server/db";
import { investmentTransactions, accounts } from "~/server/db/schema";
import { marketDataService } from "~/server/services/brapi";

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
  transactionDate?: string;
  isFixedIncome?: boolean;
  fixedIncomeYieldType?: "CDI_PERCENTAGE" | "PREFIXED" | null;
  fixedIncomeRate?: number | null;
  fixedIncomeMaturityDate?: string | null;
};

export class InvestmentRepository {
  /**
   * Create a new investment transaction
   */
  async create(values: CreateInvestmentInput): Promise<InvestmentTransaction> {
    const [transaction] = await db
      .insert(investmentTransactions)
      .values(values)
      .returning();

    return transaction!;
  }

  /**
   * Get investment transaction by ID
   */
  async findById(id: number): Promise<InvestmentTransaction | undefined> {
    return await db.query.investmentTransactions.findFirst({
      where: eq(investmentTransactions.id, id),
    });
  }

  /**
   * Get all transactions for a specific user across all their investment accounts
   */
  async findByUserId(userId: string): Promise<InvestmentTransaction[]> {
    return await db
      .select({
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
      })
      .from(investmentTransactions)
      .innerJoin(
        accounts,
        eq(investmentTransactions.investmentAccountId, accounts.id),
      )
      .where(eq(accounts.userId, userId))
      .orderBy(desc(investmentTransactions.transactionDate));
  }

  /**
   * Get all transactions for a specific asset across user's accounts
   */
  async findByAssetName(
    userId: string,
    assetName: string,
  ): Promise<InvestmentTransaction[]> {
    return await db
      .select({
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
      })
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

  /**
   * Get transactions by date range for a user
   */
  async findByDateRange(
    userId: string,
    startDate: string,
    endDate: string,
  ): Promise<InvestmentTransaction[]> {
    return await db
      .select({
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
      })
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

  /**
   * Get transactions by type (BUY or SELL) for a user
   */
  async findByTransactionType(
    userId: string,
    transactionType: "BUY" | "SELL",
  ): Promise<InvestmentTransaction[]> {
    return await db
      .select({
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
      })
      .from(investmentTransactions)
      .innerJoin(
        accounts,
        eq(investmentTransactions.investmentAccountId, accounts.id),
      )
      .where(
        and(
          eq(accounts.userId, userId),
          eq(investmentTransactions.transactionType, transactionType),
        ),
      )
      .orderBy(desc(investmentTransactions.transactionDate));
  }

  async getPortfolioHoldings(userId: string) {
    return await db
      .select({
        assetName: investmentTransactions.assetName,
        assetTypeId: investmentTransactions.assetTypeId,
        totalQuantity: sql<number>`
          SUM(
            CASE 
              WHEN ${investmentTransactions.transactionType} = 'BUY' THEN ${investmentTransactions.quantity}
              WHEN ${investmentTransactions.transactionType} = 'SELL' THEN -${investmentTransactions.quantity}
              ELSE 0
            END
          )
        `.as("total_quantity"),
        averageCost: sql<number>`
          SUM(
            CASE 
              WHEN ${investmentTransactions.transactionType} = 'BUY' 
              THEN ${investmentTransactions.totalAmount}
              ELSE 0
            END
          ) / NULLIF(SUM(
            CASE 
              WHEN ${investmentTransactions.transactionType} = 'BUY' 
              THEN ${investmentTransactions.quantity}
              ELSE 0
            END
          ), 0)
        `.as("average_cost"),
        totalInvested: sql<number>`
          SUM(
            CASE 
              WHEN ${investmentTransactions.transactionType} = 'BUY' 
              THEN ${investmentTransactions.totalAmount}
              ELSE 0
            END
          )
        `.as("total_invested"),
        isFixedIncome: investmentTransactions.isFixedIncome,
        fixedIncomeYieldType: investmentTransactions.fixedIncomeYieldType,
        fixedIncomeRate: investmentTransactions.fixedIncomeRate,
        fixedIncomeMaturityDate: investmentTransactions.fixedIncomeMaturityDate,
      })
      .from(investmentTransactions)
      .innerJoin(
        accounts,
        eq(investmentTransactions.investmentAccountId, accounts.id),
      )
      .where(eq(accounts.userId, userId))
      .groupBy(
        investmentTransactions.assetName,
        investmentTransactions.assetTypeId,
        investmentTransactions.isFixedIncome,
        investmentTransactions.fixedIncomeYieldType,
        investmentTransactions.fixedIncomeRate,
        investmentTransactions.fixedIncomeMaturityDate,
      )
      .having(sql`total_quantity > 0`);
  }

  async getTransactionSummary(userId: string) {
    const [summary] = await db
      .select({
        totalTransactions: sql<number>`COUNT(*)`,
        totalBuys: sql<number>`SUM(CASE WHEN ${investmentTransactions.transactionType} = 'BUY' THEN 1 ELSE 0 END)`,
        totalSells: sql<number>`SUM(CASE WHEN ${investmentTransactions.transactionType} = 'SELL' THEN 1 ELSE 0 END)`,
        totalInvested: sql<number>`SUM(CASE WHEN ${investmentTransactions.transactionType} = 'BUY' THEN ${investmentTransactions.totalAmount} ELSE 0 END)`,
        totalReturns: sql<number>`SUM(CASE WHEN ${investmentTransactions.transactionType} = 'SELL' THEN ${investmentTransactions.totalAmount} ELSE 0 END)`,
      })
      .from(investmentTransactions)
      .innerJoin(
        accounts,
        eq(investmentTransactions.investmentAccountId, accounts.id),
      )
      .where(eq(accounts.userId, userId));

    return summary;
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

  async findAll(): Promise<InvestmentTransaction[]> {
    return await db.query.investmentTransactions.findMany({
      orderBy: [desc(investmentTransactions.transactionDate)],
    });
  }

  /**
   * Calculate the current value of a fixed income asset based on its yield type.
   * CDI_PERCENTAGE: totalAmount * (1 + (CDI_ANNUAL_RATE * rate/100))^(days/365)
   * PREFIXED: totalAmount * (1 + rate/100)^(days/365)
   * @param referenceDate - Optional reference date to use instead of "now"
   */
  private calculateFixedIncomeCurrentValue(
    totalAmount: number,
    yieldType: string,
    rate: number,
    purchaseDate: string,
    referenceDate?: Date,
  ): number {
    const CDI_ANNUAL_RATE = 0.1365; // ~13.65% as of 2024
    const ref = referenceDate ?? new Date();
    const purchase = new Date(purchaseDate);
    const daysDiff = (ref.getTime() - purchase.getTime()) / (1000 * 60 * 60 * 24);
    const years = Math.max(0, daysDiff / 365);

    if (yieldType === "CDI_PERCENTAGE") {
      // rate is the % of CDI, e.g. 100 means 100% of CDI
      const effectiveRate = CDI_ANNUAL_RATE * (rate / 100);
      return totalAmount * Math.pow(1 + effectiveRate, years);
    } else if (yieldType === "PREFIXED") {
      // rate is the annual fixed rate, e.g. 15 means 15% per year
      return totalAmount * Math.pow(1 + rate / 100, years);
    }
    return totalAmount;
  }

  private getPeriodStartDate(range: string): Date {
    const now = new Date();
    switch (range) {
      case "1d": {
        const d = new Date(now);
        d.setDate(d.getDate() - 1);
        return d;
      }
      case "5d": {
        const d = new Date(now);
        d.setDate(d.getDate() - 5);
        return d;
      }
      case "1mo": {
        const d = new Date(now);
        d.setMonth(d.getMonth() - 1);
        return d;
      }
      case "6mo": {
        const d = new Date(now);
        d.setMonth(d.getMonth() - 6);
        return d;
      }
      case "1y": {
        const d = new Date(now);
        d.setFullYear(d.getFullYear() - 1);
        return d;
      }
      default:
        return new Date(0); // epoch for max
    }
  }

  async calculatePortfolioValue(
    userId: string,
    currentPrices: Record<string, number>,
  ): Promise<{
    holdings: Array<{
      assetName: string;
      quantity: number;
      averageCost: number;
      currentPrice: number;
      currentValue: number;
      totalCost: number;
      unrealizedGain: number;
      unrealizedGainPercent: number;
      isFixedIncome: boolean;
      fixedIncomeYieldType: string | null;
      fixedIncomeRate: number | null;
      fixedIncomeMaturityDate: string | null;
    }>;
    totalValue: number;
    totalCost: number;
    totalGain: number;
    totalGainPercent: number;
  }> {
    const holdings = await this.getPortfolioHoldings(userId);

    // For fixed income, we need the earliest transaction date to calculate yield
    const transactions = await this.findByUserId(userId);
    const assetEarliestDate = new Map<string, string>();
    for (const tx of transactions) {
      if (tx.transactionType !== "BUY") continue;
      const txDate = tx.transactionDate;
      if (!txDate) continue;
      const existing = assetEarliestDate.get(tx.assetName);
      if (!existing || txDate < existing) {
        assetEarliestDate.set(tx.assetName, txDate);
      }
    }

    const enrichedHoldings = holdings.map((holding) => {
      const isFixed = holding.isFixedIncome ?? false;
      const totalCost = holding.totalQuantity * (holding.averageCost || 0);

      let currentPrice: number;
      let currentValue: number;

      if (isFixed && holding.fixedIncomeYieldType && holding.fixedIncomeRate != null) {
        const purchaseDate = assetEarliestDate.get(holding.assetName) ?? new Date().toISOString().split("T")[0]!;
        currentValue = this.calculateFixedIncomeCurrentValue(
          totalCost,
          holding.fixedIncomeYieldType,
          holding.fixedIncomeRate,
          purchaseDate,
        );
        currentPrice = holding.totalQuantity > 0 ? currentValue / holding.totalQuantity : 0;
      } else {
        currentPrice = currentPrices[holding.assetName] ?? (holding.averageCost || 0);
        currentValue = holding.totalQuantity * currentPrice;
      }

      const unrealizedGain = currentValue - totalCost;
      const unrealizedGainPercent =
        totalCost > 0 ? (unrealizedGain / totalCost) * 100 : 0;

      return {
        assetName: holding.assetName,
        quantity: holding.totalQuantity,
        averageCost: holding.averageCost || 0,
        currentPrice,
        currentValue,
        totalCost,
        unrealizedGain,
        unrealizedGainPercent,
        isFixedIncome: isFixed,
        fixedIncomeYieldType: holding.fixedIncomeYieldType ?? null,
        fixedIncomeRate: holding.fixedIncomeRate ?? null,
        fixedIncomeMaturityDate: holding.fixedIncomeMaturityDate ?? null,
      };
    });

    const totalValue = enrichedHoldings.reduce(
      (sum, h) => sum + h.currentValue,
      0,
    );
    const totalCost = enrichedHoldings.reduce((sum, h) => sum + h.totalCost, 0);
    const totalGain = totalValue - totalCost;
    const totalGainPercent = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

    return {
      holdings: enrichedHoldings,
      totalValue,
      totalCost,
      totalGain,
      totalGainPercent,
    };
  }

  async getPortfolioWithMarketData(userId: string, range?: string) {
    const holdings = await this.getPortfolioHoldings(userId);

    if (holdings.length === 0) {
      return {
        holdings: [],
        totalValue: 0,
        totalCost: 0,
        totalGain: 0,
        totalGainPercent: 0,
      };
    }

    // Only fetch market data for non-fixed-income assets
    const marketAssets = holdings.filter((h) => !h.isFixedIncome);
    const symbols = marketAssets.map((h) => h.assetName);

    const usePeriod = range && range !== "max";

    // Fetch current prices and (optionally) start-of-period historical prices in parallel
    const [currentPrices, ...historicalResults] = await Promise.all([
      symbols.length > 0 ? marketDataService.getQuotes(symbols) : Promise.resolve({}),
      ...(usePeriod && symbols.length > 0
        ? symbols.map((s) =>
            marketDataService.getHistoricalData(s, range, "1d").catch(() => []),
          )
        : []),
    ]);

    // Map symbol -> start-of-period close price
    const startPrices: Record<string, number> = {};
    if (usePeriod) {
      symbols.forEach((symbol, i) => {
        const data = historicalResults[i];
        if (data && data.length > 0) {
          startPrices[symbol] = data[0]!.close;
        }
      });
    }

    // Get base portfolio value (all-time unrealized gains)
    const baseResult = await this.calculatePortfolioValue(userId, currentPrices as Record<string, number>);

    // If no range filtering, period gain = all-time gain
    if (!usePeriod) {
      return {
        ...baseResult,
        holdings: baseResult.holdings.map((h) => ({
          ...h,
          periodGain: h.unrealizedGain,
          periodGainPercent: h.unrealizedGainPercent,
        })),
      };
    }

    // Get earliest purchase dates for fixed-income period calculation
    const allTransactions = await this.findByUserId(userId);
    const assetEarliestDate = new Map<string, string>();
    for (const tx of allTransactions) {
      if (tx.transactionType !== "BUY") continue;
      const txDate = tx.transactionDate;
      if (!txDate) continue;
      const existing = assetEarliestDate.get(tx.assetName);
      if (!existing || txDate < existing) {
        assetEarliestDate.set(tx.assetName, txDate);
      }
    }

    const periodStart = this.getPeriodStartDate(range);

    const holdingsWithPeriod = baseResult.holdings.map((h) => {
      let periodGain: number;
      let periodGainPercent: number;

      if (h.isFixedIncome && h.fixedIncomeYieldType && h.fixedIncomeRate != null) {
        // For fixed income, compute the value at start of period
        const purchaseDateStr =
          assetEarliestDate.get(h.assetName) ??
          periodStart.toISOString().split("T")[0]!;
        // Use the later of purchaseDate and periodStart
        const purchaseTime = new Date(purchaseDateStr).getTime();
        const effectiveStartDate =
          purchaseTime >= periodStart.getTime() ? new Date(purchaseDateStr) : periodStart;

        const startValue = this.calculateFixedIncomeCurrentValue(
          h.totalCost,
          h.fixedIncomeYieldType,
          h.fixedIncomeRate,
          purchaseDateStr,
          effectiveStartDate,
        );
        periodGain = h.currentValue - startValue;
        periodGainPercent = startValue > 0 ? (periodGain / startValue) * 100 : 0;
      } else {
        const startPrice = startPrices[h.assetName];
        if (startPrice !== undefined) {
          const startValue = h.quantity * startPrice;
          periodGain = h.currentValue - startValue;
          periodGainPercent = startValue > 0 ? (periodGain / startValue) * 100 : 0;
        } else {
          // Fall back to all-time gain if no historical data available
          periodGain = h.unrealizedGain;
          periodGainPercent = h.unrealizedGainPercent;
        }
      }

      return { ...h, periodGain, periodGainPercent };
    });

    return {
      ...baseResult,
      holdings: holdingsWithPeriod,
    };
  }

  /**
   * Estimate the earliest purchase date for the "max" range.
   * Uses actual transaction dates when available, falls back to
   * price-matching estimation for assets without dates.
   */
  private async estimateEarliestPurchaseDate(
    assets: string[],
    holdingsMap: Map<string, { quantity: number; totalCost: number }>,
    pricesByDate: Record<string, Record<string, number>>,
    dates: string[],
    userId: string,
  ): Promise<string> {
    // Check if we have real transaction dates
    const transactions = await this.findByUserId(userId);
    const assetDates = new Map<string, string>();

    // For each asset, find the earliest BUY transaction date (if it's a real date, not just CURRENT_TIMESTAMP)
    for (const tx of transactions) {
      if (tx.transactionType !== "BUY") continue;
      if (!assets.includes(tx.assetName)) continue;

      const txDate = tx.transactionDate;
      // transactionDate might be null or a timestamp-like value from CURRENT_TIMESTAMP
      // A real user-provided date looks like "2025-01-15", a CURRENT_TIMESTAMP looks like a full ISO string or similar
      if (!txDate || txDate.length > 10) continue; // skip auto-generated timestamps

      const existing = assetDates.get(tx.assetName);
      if (!existing || txDate < existing) {
        assetDates.set(tx.assetName, txDate);
      }
    }

    const purchaseDates: string[] = [];

    for (const assetName of assets) {
      // Use real date if available
      const realDate = assetDates.get(assetName);
      if (realDate) {
        purchaseDates.push(realDate);
        continue;
      }

      // Otherwise, estimate via price matching
      const holding = holdingsMap.get(assetName);
      if (!holding || holding.quantity <= 0) continue;

      const avgCost = holding.totalCost / holding.quantity;
      let found = false;

      for (let i = dates.length - 1; i >= 0; i--) {
        const date = dates[i]!;
        const price = pricesByDate[date]?.[assetName];
        if (price === undefined) continue;

        const diff = Math.abs(price - avgCost) / avgCost;
        if (diff <= 0.15) {
          purchaseDates.push(date);
          found = true;
          break;
        }
      }

      if (!found) {
        let bestDate: string | null = null;
        let bestDiff = Infinity;
        for (let i = dates.length - 1; i >= 0; i--) {
          const date = dates[i]!;
          const price = pricesByDate[date]?.[assetName];
          if (price === undefined) continue;
          const diff = Math.abs(price - avgCost);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestDate = date;
          }
        }
        if (bestDate) purchaseDates.push(bestDate);
      }
    }

    if (purchaseDates.length === 0) {
      const fallback = new Date();
      fallback.setFullYear(fallback.getFullYear() - 1);
      return fallback.toISOString().split("T")[0]!;
    }

    // Use earliest date with 1 month buffer
    const earliest = purchaseDates.sort()[0]!;
    const earlyDate = new Date(earliest);
    earlyDate.setMonth(earlyDate.getMonth() - 1);
    return earlyDate.toISOString().split("T")[0]!;
  }

  async getPortfolioPerformance(
    userId: string,
    range = "1y",
  ): Promise<{
    dates: string[];
    portfolioValue: number[];
    totalCost: number[];
    gainLoss: number[];
    cdiValue: number[];
  }> {
    const holdings = await this.getPortfolioHoldings(userId);

    if (holdings.length === 0) {
      return {
        dates: [],
        portfolioValue: [],
        totalCost: [],
        gainLoss: [],
        cdiValue: [],
      };
    }

    const marketHoldings = holdings.filter((h) => h.totalQuantity > 0 && !h.isFixedIncome);
    const fixedIncomeHoldings = holdings.filter((h) => h.totalQuantity > 0 && h.isFixedIncome);

    const uniqueMarketAssets = marketHoldings.map((h) => h.assetName);
    const uniqueAssets = holdings.filter((h) => h.totalQuantity > 0).map((h) => h.assetName);

    if (uniqueAssets.length === 0) {
      return {
        dates: [],
        portfolioValue: [],
        totalCost: [],
        gainLoss: [],
        cdiValue: [],
      };
    }

    const holdingsMap = new Map(
      holdings.map((h) => [
        h.assetName,
        {
          quantity: h.totalQuantity,
          totalCost: h.totalQuantity * (h.averageCost || 0),
          isFixedIncome: h.isFixedIncome ?? false,
          fixedIncomeYieldType: h.fixedIncomeYieldType,
          fixedIncomeRate: h.fixedIncomeRate,
        },
      ]),
    );

    const allTransactions = await this.findByUserId(userId);
    const assetEarliestDate = new Map<string, string>();
    for (const tx of allTransactions) {
      if (tx.transactionType !== "BUY") continue;
      const txDate = tx.transactionDate;
      if (!txDate) continue;
      const existing = assetEarliestDate.get(tx.assetName);
      if (!existing || txDate < existing) {
        assetEarliestDate.set(tx.assetName, txDate);
      }
    }

    const historicalDataPromises = uniqueMarketAssets.map((assetName) =>
      marketDataService
        .getHistoricalData(assetName, range, "1d")
        .catch(() => []),
    );

    const historicalDataResults = await Promise.all(historicalDataPromises);

    const pricesByDate: Record<string, Record<string, number>> = {};

    historicalDataResults.forEach((data, index) => {
      const assetName = uniqueMarketAssets[index]!;
      data.forEach((point) => {
        const date = new Date(point.date * 1000).toISOString().split("T")[0]!;
        pricesByDate[date] ??= {};
        pricesByDate[date][assetName] = point.close;
      });
    });

    let dates = Object.keys(pricesByDate).sort();

    if (dates.length === 0 && fixedIncomeHoldings.length > 0) {
      const allPurchaseDates = fixedIncomeHoldings
        .map((h) => assetEarliestDate.get(h.assetName))
        .filter(Boolean) as string[];
      const earliest = allPurchaseDates.sort()[0] ?? new Date().toISOString().split("T")[0]!;
      const start = new Date(earliest);
      const end = new Date();
      const generatedDates: string[] = [];
      const current = new Date(start);
      while (current <= end) {
        generatedDates.push(current.toISOString().split("T")[0]!);
        current.setDate(current.getDate() + 1);
      }
      dates = generatedDates;
    }

    if (dates.length === 0) {
      return {
        dates: [],
        portfolioValue: [],
        totalCost: [],
        gainLoss: [],
        cdiValue: [],
      };
    }

    if (range === "max") {
      const estimatedStart = await this.estimateEarliestPurchaseDate(
        uniqueAssets,
        holdingsMap,
        pricesByDate,
        dates,
        userId,
      );
      dates = dates.filter((d) => d >= estimatedStart);

      if (dates.length === 0) {
        return {
          dates: [],
          portfolioValue: [],
          totalCost: [],
          gainLoss: [],
          cdiValue: [],
        };
      }
    }

    const fixedTotalCost = uniqueAssets.reduce((sum, asset) => {
      return sum + (holdingsMap.get(asset)?.totalCost ?? 0);
    }, 0);

    const portfolioValue: number[] = [];
    const totalCostArr: number[] = [];
    const gainLoss: number[] = [];

    const lastKnownPrices: Record<string, number> = {};

    dates.forEach((date) => {
      let dayValue = 0;

      uniqueMarketAssets.forEach((assetName) => {
        const holding = holdingsMap.get(assetName);
        if (!holding || holding.quantity <= 0) return;

        const price = pricesByDate[date]?.[assetName];
        if (price !== undefined) {
          lastKnownPrices[assetName] = price;
        }
        const effectivePrice = lastKnownPrices[assetName] ?? 0;
        dayValue += holding.quantity * effectivePrice;
      });

      fixedIncomeHoldings.forEach((h) => {
        const holding = holdingsMap.get(h.assetName);
        if (!holding || holding.quantity <= 0) return;
        if (!holding.fixedIncomeYieldType || holding.fixedIncomeRate == null) {
          dayValue += holding.totalCost;
          return;
        }

        const purchaseDate = assetEarliestDate.get(h.assetName) ?? date;
        const CDI_ANNUAL_RATE = 0.1365;
        const purchaseTime = new Date(purchaseDate).getTime();
        const currentTime = new Date(date).getTime();
        const daysDiff = Math.max(0, (currentTime - purchaseTime) / (1000 * 60 * 60 * 24));
        const years = daysDiff / 365;

        let assetValue = holding.totalCost;
        if (holding.fixedIncomeYieldType === "CDI_PERCENTAGE") {
          const effectiveRate = CDI_ANNUAL_RATE * (holding.fixedIncomeRate / 100);
          assetValue = holding.totalCost * Math.pow(1 + effectiveRate, years);
        } else if (holding.fixedIncomeYieldType === "PREFIXED") {
          assetValue = holding.totalCost * Math.pow(1 + holding.fixedIncomeRate / 100, years);
        }
        dayValue += assetValue;
      });

      portfolioValue.push(dayValue);
      totalCostArr.push(fixedTotalCost);
      gainLoss.push(dayValue - fixedTotalCost);
    });

    const cdiData = await marketDataService.getCDIData(
      dates[0]!,
      dates[dates.length - 1]!,
    );

    const cdiByDate = new Map(cdiData.map((d) => [d.date, d.value]));
    const baseCDI = cdiByDate.get(dates[0]!) ?? 100;

    const cdiValue = dates.map((date) => {
      const cdiVal = cdiByDate.get(date) ?? baseCDI;
      return (cdiVal / baseCDI) * fixedTotalCost;
    });

    return {
      dates,
      portfolioValue,
      totalCost: totalCostArr,
      gainLoss,
      cdiValue,
    };
  }
}

export const investmentRepository = new InvestmentRepository();
