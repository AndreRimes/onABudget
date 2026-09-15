import { eq, desc, and, between, inArray } from "drizzle-orm";
import { db } from "~/server/db";
import {
  investmentTransactions,
  accounts,
  assetLabels,
  assetTypes,
  dividends,
  providerHoldings,
} from "~/server/db/schema";
import type { CandlePoint } from "~/server/services/brapi";
import {
  marketCacheService,
  todayIso,
  type QuoteStatus,
} from "~/server/services/market-cache";
import { dividendRepository } from "../dividends/repository";
import { BENCHMARK_IDS } from "./benchmarks";
import {
  reconcileHoldings,
  type ProviderHoldingFact,
  type Reconciliation,
} from "./reconcile";
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

/** The still-held positions that are priced from an external source. */
interface MarketTargets {
  /** Assets priced by a live quote — the asset name *is* the ticker. */
  symbols: string[];
  /** Tesouro positions, as [assetName, canonical title key]. */
  tesouro: Array<[string, string]>;
  /** Fund positions, as [assetName, CNPJ]. Priced from the CVM quota series. */
  funds: Array<[string, string]>;
}

/**
 * Which assets in a ledger still need market data: everything with a positive
 * net quantity, split by how it is priced. Shared by the snapshot and by the
 * forced quote refresh so both ask the providers for exactly the same set.
 */
function resolveMarketTargets(
  transactions: Pick<
    InvestmentTransaction,
    | "assetName"
    | "transactionType"
    | "quantity"
    | "isFixedIncome"
    | "tesouroTitle"
    | "fundCnpj"
  >[],
): MarketTargets {
  const netQuantity = new Map<
    string,
    {
      quantity: number;
      fixed: boolean;
      tesouroTitle: string | null;
      fundCnpj: string | null;
    }
  >();
  for (const tx of transactions) {
    const entry = netQuantity.get(tx.assetName) ?? {
      quantity: 0,
      fixed: tx.isFixedIncome ?? false,
      tesouroTitle: tx.tesouroTitle ?? null,
      fundCnpj: tx.fundCnpj ?? null,
    };
    entry.quantity += tx.transactionType === "BUY" ? tx.quantity : -tx.quantity;
    netQuantity.set(tx.assetName, entry);
  }

  const held = [...netQuantity.entries()].filter(
    ([, entry]) => entry.quantity > 1e-9,
  );

  return {
    // A fund is never asked of the quote provider: its name is a CNPJ, which
    // brapi can only ever answer "not found" to.
    symbols: held
      .filter(
        ([, entry]) => !entry.fixed && !entry.tesouroTitle && !entry.fundCnpj,
      )
      .map(([assetName]) => assetName),
    tesouro: held
      .filter(([, entry]) => entry.tesouroTitle)
      .map(([assetName, entry]) => [assetName, entry.tesouroTitle!]),
    funds: held
      .filter(([, entry]) => entry.fundCnpj && !entry.tesouroTitle)
      .map(([assetName, entry]) => [assetName, entry.fundCnpj!]),
  };
}

/** Earliest transaction date in the ledger, or today when it is empty. */
function ledgerStart(
  transactions: Pick<InvestmentTransaction, "transactionDate">[],
  today: string,
): string {
  return transactions.reduce(
    (earliest, tx) =>
      tx.transactionDate.slice(0, 10) < earliest
        ? tx.transactionDate.slice(0, 10)
        : earliest,
    today,
  );
}

/**
 * Provider-supplied facts about a user's assets: the readable label, and the
 * quota the provider last reported (which only ever serves to pick between a
 * fund's subclasses).
 */
async function assetLabelsFor(userId: string) {
  return await db
    .select({
      assetName: assetLabels.assetName,
      label: assetLabels.label,
      providerQuota: assetLabels.providerQuota,
    })
    .from(assetLabels)
    .where(eq(assetLabels.userId, userId));
}

/** What the provider last reported for each of this owner's holdings. */
async function providerHoldingsFor(
  userId: string,
): Promise<ProviderHoldingFact[]> {
  return await db
    .select({
      assetName: providerHoldings.assetName,
      quantity: providerHoldings.quantity,
      value: providerHoldings.value,
      profit: providerHoldings.profit,
      syncedAt: providerHoldings.syncedAt,
    })
    .from(providerHoldings)
    .where(eq(providerHoldings.userId, userId));
}

/** CNPJ -> provider-reported quota, for the funds actually held. */
function referenceQuotasFor(
  labels: Array<{ assetName: string; providerQuota: number | null }>,
  funds: Array<[string, string]>,
): Map<string, number> {
  const quotaByAsset = new Map(
    labels
      .filter((entry) => entry.providerQuota && entry.providerQuota > 0)
      .map((entry) => [entry.assetName, entry.providerQuota!]),
  );
  const references = new Map<string, number>();
  for (const [assetName, cnpj] of funds) {
    const quota = quotaByAsset.get(assetName);
    if (quota !== undefined) references.set(cnpj, quota);
  }
  return references;
}

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
  tesouroTitle: investmentTransactions.tesouroTitle,
  fundCnpj: investmentTransactions.fundCnpj,
  sourceHash: investmentTransactions.sourceHash,
};

export class InvestmentRepository {
  /** Ids of every account the user owns — the scoping key for all writes. */
  private async userAccountIds(userId: string): Promise<number[]> {
    const userAccounts = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.userId, userId));
    return userAccounts.map((account) => account.id);
  }

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

  /**
   * Scoped by the user's accounts, so a guessed id belonging to someone else
   * simply matches no rows and returns undefined.
   */
  async update(
    userId: string,
    id: number,
    values: Partial<CreateInvestmentInput>,
  ): Promise<InvestmentTransaction | undefined> {
    const accountIds = await this.userAccountIds(userId);
    if (accountIds.length === 0) return undefined;

    const [updated] = await db
      .update(investmentTransactions)
      .set(values)
      .where(
        and(
          eq(investmentTransactions.id, id),
          inArray(investmentTransactions.investmentAccountId, accountIds),
        ),
      )
      .returning();

    return updated;
  }

  async delete(userId: string, id: number): Promise<boolean> {
    const accountIds = await this.userAccountIds(userId);
    if (accountIds.length === 0) return false;

    const result = await db
      .delete(investmentTransactions)
      .where(
        and(
          eq(investmentTransactions.id, id),
          inArray(investmentTransactions.investmentAccountId, accountIds),
        ),
      )
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
    const accountIds = await this.userAccountIds(userId);
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
   * Rename an asset: change `assetName` on every transaction and dividend the
   * user holds under `oldName`. Leaves `source_hash` (derived from the original
   * B3 file ticker) and `tesouro_title` untouched, so B3 re-import dedup and
   * Tesouro mark-to-market keep working after a rename.
   */
  async renameByAssetName(
    userId: string,
    oldName: string,
    newName: string,
  ): Promise<{ transactionsUpdated: number; dividendsUpdated: number }> {
    const accountIds = await this.userAccountIds(userId);
    if (accountIds.length === 0) {
      return { transactionsUpdated: 0, dividendsUpdated: 0 };
    }

    const updatedTransactions = await db
      .update(investmentTransactions)
      .set({ assetName: newName })
      .where(
        and(
          inArray(investmentTransactions.investmentAccountId, accountIds),
          eq(investmentTransactions.assetName, oldName),
        ),
      )
      .returning({ id: investmentTransactions.id });

    const updatedDividends = await db
      .update(dividends)
      .set({ assetName: newName })
      .where(
        and(
          inArray(dividends.investmentAccountId, accountIds),
          eq(dividends.assetName, oldName),
        ),
      )
      .returning({ id: dividends.id });

    return {
      transactionsUpdated: updatedTransactions.length,
      dividendsUpdated: updatedDividends.length,
    };
  }

  /**
   * Set the fixed-income yield metadata (yield type / rate / maturity) on every
   * transaction the user holds under a given asset name. B3 imports arrive with
   * these blank, so this lets the user fill them in afterward and have the
   * engine actually accrue yield. Returns the number of transactions updated.
   */
  async setFixedIncomeYieldByAssetName(
    userId: string,
    assetName: string,
    values: {
      fixedIncomeYieldType: "CDI_PERCENTAGE" | "PREFIXED";
      fixedIncomeRate: number;
      fixedIncomeMaturityDate: string | null;
    },
  ): Promise<number> {
    const accountIds = await this.userAccountIds(userId);
    if (accountIds.length === 0) return 0;

    const updated = await db
      .update(investmentTransactions)
      .set({
        isFixedIncome: true,
        fixedIncomeYieldType: values.fixedIncomeYieldType,
        fixedIncomeRate: values.fixedIncomeRate,
        fixedIncomeMaturityDate: values.fixedIncomeMaturityDate,
      })
      .where(
        and(
          inArray(investmentTransactions.investmentAccountId, accountIds),
          eq(investmentTransactions.assetName, assetName),
        ),
      )
      .returning({ id: investmentTransactions.id });

    return updated.length;
  }

  /**
   * Force a quote refresh for the user's held positions, as of *now*.
   *
   * The snapshot normally serves prices cached for up to the quote TTL, so a
   * page reload can legitimately show a price minutes old. This is the manual
   * escape hatch: it skips every cache guard and hits the providers, then the
   * next snapshot read picks the fresh rows up from the same cache tables.
   *
   * `assetName` narrows it to one position. Never throws for an individual
   * asset — a provider that is down simply reports a non-"ok" status.
   */
  async refreshQuotes(
    userId: string,
    assetName?: string,
  ): Promise<{
    refreshedAt: string;
    quotes: Array<{
      assetName: string;
      price: number | null;
      status: QuoteStatus;
      asOf: string | null;
    }>;
  }> {
    const transactions = assetName
      ? await this.findByAssetName(userId, assetName)
      : await this.findByUserId(userId);

    const { symbols, tesouro, funds } = resolveMarketTargets(transactions);
    const today = todayIso();
    const fromDate = ledgerStart(transactions, today);
    const titleKeys = [...new Set(tesouro.map(([, titleKey]) => titleKey))];
    const labels = await assetLabelsFor(userId);

    const [quotes, tesouroByTitle, quotasByCnpj] = await Promise.all([
      marketCacheService.getQuotes(symbols, { force: true }),
      marketCacheService.getTesouroPrices(titleKeys, fromDate, { force: true }),
      // Not forced: the CVM publishes once a day and the month already read
      // today cannot have changed since. Only months still missing are fetched.
      marketCacheService.getFundQuotas(
        funds.map(([, cnpj]) => cnpj),
        fromDate,
        { referenceQuotas: referenceQuotasFor(labels, funds) },
      ),
    ]);

    const results = symbols.map((symbol) => {
      const quote = quotes.get(symbol);
      return {
        assetName: symbol,
        price: quote?.price ?? null,
        status: quote?.status ?? ("unavailable" as QuoteStatus),
        asOf: quote?.asOf?.toISOString() ?? null,
      };
    });

    // Tesouro positions have no intraday quote: their "cotação" is the latest
    // official daily PU, so report that instead of leaving them out.
    for (const [tesouroAsset, titleKey] of tesouro) {
      const series = tesouroByTitle.get(titleKey);
      const last = series?.[series.length - 1];
      results.push({
        assetName: tesouroAsset,
        price: last?.close ?? null,
        status: last ? "ok" : "unavailable",
        asOf: last ? new Date(`${last.date}T00:00:00`).toISOString() : null,
      });
    }

    // Funds likewise: the latest published quota, which trails today by a few
    // business days because that is when the CVM publishes it.
    for (const [fundAsset, cnpj] of funds) {
      const series = quotasByCnpj.get(cnpj);
      const last = series?.[series.length - 1];
      results.push({
        assetName: fundAsset,
        price: last?.close ?? null,
        status: last ? "ok" : "unavailable",
        asOf: last ? new Date(`${last.date}T00:00:00`).toISOString() : null,
      });
    }

    return { refreshedAt: new Date().toISOString(), quotes: results };
  }

  /**
   * Single source of truth for the investments page: holdings, summary and
   * chart series computed in one pass over the same market data.
   *
   * `assetName` narrows the whole computation to one asset. Because the engine
   * is pure and derives everything — net deposits, the CDI shadow portfolio,
   * the series anchoring — from the transaction and dividend arrays it is
   * handed, filtering those two arrays is all it takes to get a correct
   * single-asset snapshot. The detail page reuses the engine rather than
   * re-deriving per-asset numbers that could drift from the portfolio view.
   */
  async getPortfolioSnapshot(
    userId: string,
    range: TimeRange = "max",
    includeSeries = true,
    assetName?: string,
  ): Promise<PortfolioSnapshot & { reconciliation: Reconciliation }> {
    // Narrowed in SQL when one asset is being viewed: the detail page used to
    // load the entire ledger and every dividend, then keep one asset's worth.
    // Narrowing here (rather than after the market fetches) also keeps the
    // quote/candle/Tesouro requests down to the single asset being viewed.
    const [transactions, userDividends, allAssetTypes] = await Promise.all([
      assetName
        ? this.findByAssetName(userId, assetName)
        : this.findByUserId(userId),
      assetName
        ? dividendRepository.findByAssetName(userId, assetName)
        : dividendRepository.findByUserId(userId),
      db.select().from(assetTypes).where(eq(assetTypes.userId, userId)),
    ]);

    // Which assets need quotes, which Tesouro titles need official prices, and
    // which funds need their CVM quota series.
    const {
      symbols: activeMarketSymbols,
      tesouro: heldTesouro,
      funds: heldFunds,
    } = resolveMarketTargets(transactions);
    const tesouroTitleKeys = [
      ...new Set(heldTesouro.map(([, titleKey]) => titleKey)),
    ];

    const today = todayIso();
    const fullStart = ledgerStart(transactions, today);

    // Everything below is independent except the fund quotas, which need the
    // provider's reference quota to pick a subclass — so only that one waits
    // for the labels; the market fetches start at once.
    const facts = Promise.all([
      assetLabelsFor(userId),
      providerHoldingsFor(userId),
    ]);
    const fundQuotas = facts.then(([labels]) =>
      marketCacheService.getFundQuotas(
        heldFunds.map(([, cnpj]) => cnpj),
        fullStart,
        { referenceQuotas: referenceQuotasFor(labels, heldFunds) },
      ),
    );
    const [
      quotes,
      candles,
      benchmarks,
      tesouroByTitle,
      [labels, providerFacts],
      quotasByCnpj,
    ] = await Promise.all([
      marketCacheService.getQuotes(activeMarketSymbols),
      marketCacheService.getCandles(activeMarketSymbols, fullStart),
      // Always compute every benchmark, not just the ones currently toggled
      // on: they are cheap once cached, and it lets the chart switch lines on
      // and off instantly instead of refetching the whole snapshot per toggle.
      marketCacheService.getBenchmarks([...BENCHMARK_IDS], fullStart),
      marketCacheService.getTesouroPrices(tesouroTitleKeys, fullStart),
      facts,
      fundQuotas,
    ]);

    // Re-key the Tesouro price series by assetName so the engine can look them
    // up the same way it looks up equity candles.
    const tesouroCandles = new Map<string, CandlePoint[]>();
    for (const [assetName, titleKey] of heldTesouro) {
      const series = tesouroByTitle.get(titleKey);
      if (series) tesouroCandles.set(assetName, series);
    }

    // Same for the fund quota series, which is keyed by CNPJ upstream.
    const fundCandles = new Map<string, CandlePoint[]>();
    for (const [assetName, cnpj] of heldFunds) {
      const series = quotasByCnpj.get(cnpj);
      if (series) fundCandles.set(assetName, series);
    }

    const snapshot = computePortfolioSnapshot({
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
        tesouroTitle: tx.tesouroTitle ?? null,
        fundCnpj: tx.fundCnpj ?? null,
      })),
      dividends: userDividends.map((dividend) => ({
        assetName: dividend.assetName,
        amount: dividend.amount,
        paymentDate: dividend.paymentDate,
      })),
      assetTypeNames: new Map(
        allAssetTypes.map((type) => [type.id, type.name]),
      ),
      assetLabels: new Map(
        labels.map((entry) => [entry.assetName, entry.label]),
      ),
      quotes,
      candles,
      tesouroCandles,
      fundCandles,
      benchmarks,
      range,
      today,
      includeSeries,
    });

    // The bank's own figures ride along with the snapshot: the page that shows
    // the portfolio is exactly where a disagreement with the source has to be
    // visible, and the comparison costs one small table read.
    return {
      ...snapshot,
      reconciliation: reconcileHoldings(snapshot.holdings, providerFacts),
    };
  }
}

export const investmentRepository = new InvestmentRepository();
