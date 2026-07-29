// Pure portfolio computation: holdings, summary and chart series come out of a
// single chronological replay of the transaction ledger, so every number the
// UI shows is derived from the same pass and cannot disagree.
//
// No DB access and no HTTP here — inputs are plain data, which keeps the whole
// engine unit-testable.
import type { CandlePoint } from "~/server/services/brapi";
import type { QuoteResult, QuoteStatus } from "~/server/services/market-cache";

export type TimeRange = "1d" | "5d" | "1mo" | "6mo" | "1y" | "max";

export interface EngineTransaction {
  assetName: string;
  assetTypeId: number;
  transactionType: "BUY" | "SELL";
  quantity: number;
  totalAmount: number;
  transactionDate: string; // YYYY-MM-DD
  isFixedIncome: boolean;
  fixedIncomeYieldType: "CDI_PERCENTAGE" | "PREFIXED" | null;
  fixedIncomeRate: number | null;
  fixedIncomeMaturityDate: string | null;
  // When set, the holding is marked to market from official Tesouro Direto PU
  // (fed in via `tesouroCandles`) instead of accruing a fixed-income yield.
  tesouroTitle: string | null;
}

export interface EngineDividend {
  assetName: string;
  amount: number;
  paymentDate: string; // YYYY-MM-DD
}

export interface SnapshotHolding {
  assetName: string;
  assetTypeId: number;
  assetTypeName: string;
  quantity: number;
  averageCost: number;
  currentPrice: number;
  priceStatus: QuoteStatus | "fixed_income";
  priceAsOf: string | null; // ISO datetime of the quote, when live
  currentValue: number;
  totalCost: number;
  unrealizedGain: number;
  unrealizedGainPercent: number;
  periodGain: number; // dividend-inclusive total return over the range
  periodGainPercent: number;
  dividendsTotal: number;
  dividends12m: number;
  isFixedIncome: boolean;
  fixedIncomeYieldType: "CDI_PERCENTAGE" | "PREFIXED" | null;
  fixedIncomeRate: number | null;
  fixedIncomeMaturityDate: string | null;
  tesouroTitle: string | null;
}

export interface SnapshotPoint {
  date: string;
  value: number; // portfolio market value on the day
  invested: number; // net deposits (buys − sell proceeds) up to the day
  gain: number; // total return anchored to 0 at the range start
  cdiGain: number; // CDI benchmark on the same cash flows, same anchoring
  dividendsAccumulated: number; // dividends received within the range
}

export interface PortfolioSnapshot {
  holdings: SnapshotHolding[];
  summary: {
    totalValue: number;
    totalInvested: number; // net deposits / aportes (matches chart's invested)
    periodGain: number;
    periodGainPercent: number;
    periodDividends: number;
    dividends12m: number;
    monthlyIncome: number; // mean of the last 3 months of dividends
    realizedGain: number;
    dailyChange: number; // today's move vs previous close, market assets only
    quotesAsOf: string | null; // most recent live quote timestamp
  };
  series: SnapshotPoint[];
  issues: Array<{ assetName: string; status: QuoteStatus; message: string }>;
}

interface AssetState {
  assetTypeId: number;
  quantity: number;
  costBasis: number;
  netDeposits: number;
  realizedGain: number;
  dividendsAccumulated: number;
  marketValue: number; // fixed income: compounded daily; market: derived from price
  lastPrice: number | null;
  candleIndex: number;
  isFixedIncome: boolean;
  fixedIncomeYieldType: "CDI_PERCENTAGE" | "PREFIXED" | null;
  fixedIncomeRate: number | null;
  fixedIncomeMaturityDate: string | null;
  tesouroTitle: string | null;
  // per-asset snapshot taken when the replay crosses the range start
  startGain: number;
  startValue: number;
}

function addDaysIso(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonthsIso(iso: string, months: number): string {
  const date = new Date(iso);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function periodStartIso(range: TimeRange, today: string): string | null {
  switch (range) {
    case "1d":
      return addDaysIso(today, -1);
    case "5d":
      return addDaysIso(today, -5);
    case "1mo":
      return addMonthsIso(today, -1);
    case "6mo":
      return addMonthsIso(today, -6);
    case "1y":
      return addMonthsIso(today, -12);
    case "max":
      return null;
  }
}

const PREFIXED_DAILY_EXPONENT = 1 / 365;

export function computePortfolioSnapshot(input: {
  transactions: EngineTransaction[];
  dividends: EngineDividend[];
  assetTypeNames: Map<number, string>;
  quotes: Map<string, QuoteResult>;
  candles: Map<string, CandlePoint[]>;
  tesouroCandles: Map<string, CandlePoint[]>; // assetName -> daily PU series
  cdiRates: Map<string, number>; // ISO date -> decimal daily rate
  range: TimeRange;
  today: string; // YYYY-MM-DD
  includeSeries: boolean;
}): PortfolioSnapshot {
  const {
    dividends,
    assetTypeNames,
    quotes,
    candles,
    tesouroCandles,
    cdiRates,
    range,
    today,
    includeSeries,
  } = input;

  const transactions = [...input.transactions].sort((a, b) =>
    a.transactionDate.localeCompare(b.transactionDate),
  );
  const sortedDividends = [...dividends].sort((a, b) =>
    a.paymentDate.localeCompare(b.paymentDate),
  );

  if (transactions.length === 0) {
    return {
      holdings: [],
      summary: {
        totalValue: 0,
        totalInvested: 0,
        periodGain: 0,
        periodGainPercent: 0,
        periodDividends: 0,
        dividends12m: 0,
        monthlyIncome: 0,
        realizedGain: 0,
        dailyChange: 0,
        quotesAsOf: null,
      },
      series: [],
      issues: [],
    };
  }

  const fullStart = transactions[0]!.transactionDate;
  const rangeStart = periodStartIso(range, today) ?? fullStart;
  // The replay always begins at the first transaction so that state (prices,
  // fixed-income accrual, cost basis) is correct when the range window opens.
  const replayStart = fullStart < rangeStart ? fullStart : rangeStart;

  const assets = new Map<string, AssetState>();
  const getAsset = (tx: EngineTransaction): AssetState => {
    let state = assets.get(tx.assetName);
    if (!state) {
      state = {
        assetTypeId: tx.assetTypeId,
        quantity: 0,
        costBasis: 0,
        netDeposits: 0,
        realizedGain: 0,
        dividendsAccumulated: 0,
        marketValue: 0,
        lastPrice: null,
        candleIndex: 0,
        isFixedIncome: tx.isFixedIncome,
        fixedIncomeYieldType: tx.fixedIncomeYieldType,
        fixedIncomeRate: tx.fixedIncomeRate,
        fixedIncomeMaturityDate: tx.fixedIncomeMaturityDate,
        tesouroTitle: tx.tesouroTitle,
        startGain: 0,
        startValue: 0,
      };
      assets.set(tx.assetName, state);
    }
    return state;
  };

  // Benchmark: the same cash flows applied to CDI.
  let cdiValue = 0;
  let netDeposits = 0;
  let dividendsAccumulated = 0;

  let txIndex = 0;
  let divIndex = 0;
  const series: SnapshotPoint[] = [];
  let startGainTotal: number | null = null;
  let startCdiGain = 0;
  // Total-return gain at the end of the day before `today`, so "today's change"
  // is derived from the exact same replay as the period gain — this makes the
  // "hoje" figure identical to the period gain when the selected range is 1d.
  const yesterdayIso = addDaysIso(today, -1);
  let yesterdayGain: number | null = null;
  let startDividendsAccumulated = 0;

  // Total return of one asset: what it is worth plus everything it paid out,
  // measured against the net cash put into it.
  const assetTotalGain = (state: AssetState): number =>
    state.marketValue + state.dividendsAccumulated - state.netDeposits;

  for (let day = replayStart; day <= today; day = addDaysIso(day, 1)) {
    const cdiRate = cdiRates.get(day) ?? 0;

    // 1) Accrue daily yield before the day's cash flows.
    cdiValue *= 1 + cdiRate;
    for (const state of assets.values()) {
      // Tesouro is marked to market (step 4), not accrued.
      if (!state.isFixedIncome || state.tesouroTitle || state.quantity <= 0)
        continue;
      if (state.fixedIncomeYieldType === "CDI_PERCENTAGE") {
        const pct = (state.fixedIncomeRate ?? 100) / 100;
        state.marketValue *= 1 + cdiRate * pct;
      } else if (state.fixedIncomeYieldType === "PREFIXED") {
        const annual = (state.fixedIncomeRate ?? 0) / 100;
        state.marketValue *= Math.pow(1 + annual, PREFIXED_DAILY_EXPONENT);
      }
    }

    // 2) Apply the day's transactions.
    while (
      txIndex < transactions.length &&
      transactions[txIndex]!.transactionDate === day
    ) {
      const tx = transactions[txIndex]!;
      const state = getAsset(tx);
      if (tx.transactionType === "BUY") {
        state.quantity += tx.quantity;
        state.costBasis += tx.totalAmount;
        state.netDeposits += tx.totalAmount;
        netDeposits += tx.totalAmount;
        cdiValue += tx.totalAmount;
        // Accrual fixed income tracks principal directly; Tesouro derives its
        // value from PU × quantity in the price-marking step instead.
        if (state.isFixedIncome && !state.tesouroTitle)
          state.marketValue += tx.totalAmount;
      } else {
        const avgCost =
          state.quantity > 0 ? state.costBasis / state.quantity : 0;
        const soldCost = avgCost * tx.quantity;
        state.quantity -= tx.quantity;
        state.costBasis -= soldCost;
        state.realizedGain += tx.totalAmount - soldCost;
        state.netDeposits -= tx.totalAmount;
        netDeposits -= tx.totalAmount;
        cdiValue -= tx.totalAmount;
        if (state.isFixedIncome && !state.tesouroTitle) {
          state.marketValue = Math.max(0, state.marketValue - tx.totalAmount);
        }
        if (state.quantity <= 1e-9) {
          state.quantity = 0;
          state.costBasis = 0;
          if (state.isFixedIncome && !state.tesouroTitle) state.marketValue = 0;
        }
      }
      txIndex++;
    }

    // 3) Apply the day's dividends.
    while (
      divIndex < sortedDividends.length &&
      sortedDividends[divIndex]!.paymentDate === day
    ) {
      const dividend = sortedDividends[divIndex]!;
      dividendsAccumulated += dividend.amount;
      const state = assets.get(dividend.assetName);
      if (state) state.dividendsAccumulated += dividend.amount;
      divIndex++;
    }

    // 4) Mark market assets to the day's price (forward-filled candles;
    //    today's point prefers the live quote).
    for (const [assetName, state] of assets) {
      // Accrual fixed income keeps its compounded marketValue (step 1). Tesouro
      // and market assets are priced here — Tesouro from its official PU series,
      // everything else from brapi candles + today's live quote.
      if (state.isFixedIncome && !state.tesouroTitle) continue;
      const assetCandles = state.tesouroTitle
        ? tesouroCandles.get(assetName)
        : candles.get(assetName);
      if (assetCandles) {
        while (
          state.candleIndex < assetCandles.length &&
          assetCandles[state.candleIndex]!.date <= day
        ) {
          state.lastPrice = assetCandles[state.candleIndex]!.close;
          state.candleIndex++;
        }
      }
      if (day === today && !state.tesouroTitle) {
        const quote = quotes.get(assetName);
        if (quote?.price != null) state.lastPrice = quote.price;
      }
      const price =
        state.lastPrice ??
        (state.quantity > 0 ? state.costBasis / state.quantity : 0);
      state.marketValue = state.quantity * price;
    }

    let totalValue = 0;
    for (const state of assets.values()) totalValue += state.marketValue;
    const totalGain = totalValue + dividendsAccumulated - netDeposits;
    const totalCdiGain = cdiValue - netDeposits;

    if (day === yesterdayIso) yesterdayGain = totalGain;

    // 5) Snapshot state the first time the replay enters the range window.
    if (day >= rangeStart && startGainTotal === null) {
      startGainTotal = totalGain;
      startCdiGain = totalCdiGain;
      startDividendsAccumulated = dividendsAccumulated;
      for (const state of assets.values()) {
        state.startGain = assetTotalGain(state);
        state.startValue = state.marketValue;
      }
    }

    if (includeSeries && day >= rangeStart) {
      series.push({
        date: day,
        value: totalValue,
        invested: netDeposits,
        gain: totalGain - (startGainTotal ?? 0),
        cdiGain: totalCdiGain - startCdiGain,
        dividendsAccumulated: dividendsAccumulated - startDividendsAccumulated,
      });
    }
  }

  // ---- Final state → holdings + summary --------------------------------
  const twelveMonthsAgo = addMonthsIso(today, -12);
  const threeMonthsAgo = addMonthsIso(today, -3);
  const dividendsByAsset12m = new Map<string, number>();
  let dividends12m = 0;
  let dividendsLast3m = 0;
  for (const dividend of sortedDividends) {
    if (dividend.paymentDate >= twelveMonthsAgo) {
      dividends12m += dividend.amount;
      dividendsByAsset12m.set(
        dividend.assetName,
        (dividendsByAsset12m.get(dividend.assetName) ?? 0) + dividend.amount,
      );
    }
    if (dividend.paymentDate >= threeMonthsAgo) {
      dividendsLast3m += dividend.amount;
    }
  }

  const holdings: SnapshotHolding[] = [];
  const issues: PortfolioSnapshot["issues"] = [];
  let totalValue = 0;
  let realizedGainTotal = 0;
  let quotesAsOf: Date | null = null;

  for (const [assetName, state] of assets) {
    realizedGainTotal += state.realizedGain;
    if (state.quantity <= 0) continue;

    totalValue += state.marketValue;

    const quote = state.isFixedIncome ? undefined : quotes.get(assetName);
    const priceStatus: SnapshotHolding["priceStatus"] = state.tesouroTitle
      ? state.lastPrice != null
        ? "ok"
        : "unavailable"
      : state.isFixedIncome
        ? "fixed_income"
        : (quote?.status ?? "unavailable");

    if (!state.isFixedIncome && quote && quote.status !== "ok") {
      issues.push({
        assetName,
        status: quote.status,
        message:
          quote.status === "not_found"
            ? `Ativo ${assetName} não encontrado na API de cotações`
            : quote.status === "stale"
              ? `Cotação de ${assetName} pode estar desatualizada`
              : `Cotação de ${assetName} indisponível no momento`,
      });
    }
    if (quote?.asOf && (!quotesAsOf || quote.asOf > quotesAsOf)) {
      quotesAsOf = quote.asOf;
    }

    const averageCost = state.costBasis / state.quantity;
    const currentPrice =
      state.quantity > 0 ? state.marketValue / state.quantity : 0;
    const unrealizedGain = state.marketValue - state.costBasis;
    const periodGain = assetTotalGain(state) - state.startGain;
    const periodBase = state.startValue > 0 ? state.startValue : state.costBasis;

    holdings.push({
      assetName,
      assetTypeId: state.assetTypeId,
      assetTypeName: assetTypeNames.get(state.assetTypeId) ?? "Outros",
      quantity: state.quantity,
      averageCost,
      currentPrice,
      priceStatus,
      priceAsOf: quote?.asOf ? quote.asOf.toISOString() : null,
      currentValue: state.marketValue,
      totalCost: state.costBasis,
      unrealizedGain,
      unrealizedGainPercent:
        state.costBasis > 0 ? (unrealizedGain / state.costBasis) * 100 : 0,
      periodGain,
      periodGainPercent: periodBase > 0 ? (periodGain / periodBase) * 100 : 0,
      dividendsTotal: state.dividendsAccumulated,
      dividends12m: dividendsByAsset12m.get(assetName) ?? 0,
      isFixedIncome: state.isFixedIncome,
      fixedIncomeYieldType: state.fixedIncomeYieldType,
      fixedIncomeRate: state.fixedIncomeRate,
      fixedIncomeMaturityDate: state.fixedIncomeMaturityDate,
      tesouroTitle: state.tesouroTitle,
    });
  }

  holdings.sort((a, b) => b.currentValue - a.currentValue);

  const finalGain = totalValue + dividendsAccumulated - netDeposits;
  const periodGain = finalGain - (startGainTotal ?? 0);
  // Invested capital = net deposits (aportes) — the exact quantity the chart
  // plots as "Total Investido" (SnapshotPoint.invested). Reporting it here, and
  // basing the return on it, keeps the "Total Investido" and "Rentabilidade"
  // cards identical to the chart's last point for every range.
  const periodGainPercent =
    netDeposits > 0 ? (periodGain / netDeposits) * 100 : 0;
  // "Today's change" = the 1-day slice of the same replay, so it matches the
  // period gain exactly when the range is 1d (Hoje). Zero if there is no prior
  // day (a portfolio that only starts today).
  const dailyChange = yesterdayGain != null ? finalGain - yesterdayGain : 0;

  return {
    holdings,
    summary: {
      totalValue,
      totalInvested: netDeposits,
      periodGain,
      periodGainPercent,
      periodDividends: dividendsAccumulated - startDividendsAccumulated,
      dividends12m,
      monthlyIncome: dividendsLast3m / 3,
      realizedGain: realizedGainTotal,
      dailyChange,
      quotesAsOf: quotesAsOf ? quotesAsOf.toISOString() : null,
    },
    series,
    issues,
  };
}
