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
  // When set, the holding is a fund share and is marked to market from the
  // CVM's daily quota series (fed in via `fundCandles`).
  fundCnpj: string | null;
}

export interface EngineDividend {
  assetName: string;
  amount: number;
  paymentDate: string; // YYYY-MM-DD
}

export interface SnapshotHolding {
  assetName: string;
  /**
   * Readable name for an asset whose key is a code (a fund CNPJ, a CDB code).
   * Null when the key already reads as a name — a ticker needs no translation.
   */
  label: string | null;
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
  fundCnpj: string | null;
}

export interface SnapshotPoint {
  date: string;
  value: number; // portfolio market value on the day
  invested: number; // net deposits (buys − sell proceeds) up to the day
  gain: number; // total return anchored to 0 at the range start
  /**
   * Benchmark id -> that benchmark's gain on the same cash flows, anchored the
   * same way. Every entry is directly comparable with `gain`, which is the
   * whole point: the lines answer "what would the same aportes have made?".
   */
  benchmarkGains: Record<string, number>;
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
    /** Benchmark id -> gain over the range on the same cash flows. */
    benchmarkGains: Record<string, number>;
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
  fundCnpj: string | null;
  // per-asset snapshot taken when the replay crosses the range start
  startGain: number;
  startValue: number;
}

/** `YYYY-MM-DD` of a UTC-midnight Date, without going through toISOString. */
function isoDayOf(date: Date): string {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return `${date.getUTCFullYear()}-${month < 10 ? "0" : ""}${month}-${day < 10 ? "0" : ""}${day}`;
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

/** First day a range covers, or null for "max" — everything since the first trade. */
export function periodStartIso(range: TimeRange, today: string): string | null {
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

interface EngineInput {
  transactions: EngineTransaction[];
  dividends: EngineDividend[];
  assetTypeNames: Map<number, string>;
  quotes: Map<string, QuoteResult>;
  candles: Map<string, CandlePoint[]>;
  tesouroCandles: Map<string, CandlePoint[]>; // assetName -> daily PU series
  fundCandles: Map<string, CandlePoint[]>; // assetName -> daily quota series
  /** assetName -> readable name, for assets whose key is a code. */
  assetLabels: Map<string, string>;
  /** benchmark id -> (ISO date -> decimal daily return) */
  benchmarks: Map<string, Map<string, number>>;
  range: TimeRange;
  today: string; // YYYY-MM-DD
  includeSeries: boolean;
}

function emptySnapshot(): PortfolioSnapshot {
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
      benchmarkGains: {},
    },
    series: [],
    issues: [],
  };
}

function newAssetState(tx: EngineTransaction): AssetState {
  return {
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
    fundCnpj: tx.fundCnpj,
    startGain: 0,
    startValue: 0,
  };
}

/** Accrual fixed income: tracks principal directly and compounds daily. */
function isAccrualFixedIncome(state: AssetState): boolean {
  return state.isFixedIncome && !state.tesouroTitle;
}

/** Total return of one asset: what it is worth plus everything it paid out,
 *  measured against the net cash put into it. */
function assetTotalGain(state: AssetState): number {
  return state.marketValue + state.dividendsAccumulated - state.netDeposits;
}

/** Compound one day of yield into an accrual fixed-income position. */
function accrueFixedIncome(state: AssetState, cdiRate: number): void {
  if (state.fixedIncomeYieldType === "CDI_PERCENTAGE") {
    const pct = (state.fixedIncomeRate ?? 100) / 100;
    state.marketValue *= 1 + cdiRate * pct;
  } else if (state.fixedIncomeYieldType === "PREFIXED") {
    const annual = (state.fixedIncomeRate ?? 0) / 100;
    state.marketValue *= Math.pow(1 + annual, PREFIXED_DAILY_EXPONENT);
  }
}

function applyBuy(state: AssetState, tx: EngineTransaction): void {
  state.quantity += tx.quantity;
  state.costBasis += tx.totalAmount;
  state.netDeposits += tx.totalAmount;
  // Accrual fixed income tracks principal directly; Tesouro derives its
  // value from PU × quantity in the price-marking step instead.
  if (isAccrualFixedIncome(state)) state.marketValue += tx.totalAmount;
}

function applySell(state: AssetState, tx: EngineTransaction): void {
  const avgCost = state.quantity > 0 ? state.costBasis / state.quantity : 0;
  const soldCost = avgCost * tx.quantity;
  state.quantity -= tx.quantity;
  state.costBasis -= soldCost;
  state.realizedGain += tx.totalAmount - soldCost;
  state.netDeposits -= tx.totalAmount;
  const accrual = isAccrualFixedIncome(state);
  if (accrual) {
    state.marketValue = Math.max(0, state.marketValue - tx.totalAmount);
  }
  if (state.quantity <= 1e-9) {
    state.quantity = 0;
    state.costBasis = 0;
    if (accrual) state.marketValue = 0;
  }
}

/** Forward-fill `state.lastPrice` from the candles published up to `day`. */
function forwardFillPrice(
  state: AssetState,
  assetCandles: CandlePoint[] | undefined,
  day: string,
): void {
  if (!assetCandles) return;
  while (
    state.candleIndex < assetCandles.length &&
    assetCandles[state.candleIndex]!.date <= day
  ) {
    state.lastPrice = assetCandles[state.candleIndex]!.close;
    state.candleIndex++;
  }
}

function priceStatusFor(
  state: AssetState,
  quote: QuoteResult | undefined,
): SnapshotHolding["priceStatus"] {
  if (state.tesouroTitle || state.fundCnpj) {
    return state.lastPrice != null ? "ok" : "unavailable";
  }
  if (state.isFixedIncome) return "fixed_income";
  return quote?.status ?? "unavailable";
}

function quoteIssueMessage(assetName: string, status: QuoteStatus): string {
  if (status === "not_found") {
    return `Ativo ${assetName} não encontrado na API de cotações`;
  }
  if (status === "stale") {
    return `Cotação de ${assetName} pode estar desatualizada`;
  }
  return `Cotação de ${assetName} indisponível no momento`;
}

interface DividendStats {
  dividends12m: number;
  dividendsLast3m: number;
  byAsset12m: Map<string, number>;
}

function dividendStats(
  dividends: EngineDividend[],
  today: string,
): DividendStats {
  const twelveMonthsAgo = addMonthsIso(today, -12);
  const threeMonthsAgo = addMonthsIso(today, -3);
  const stats: DividendStats = {
    dividends12m: 0,
    dividendsLast3m: 0,
    byAsset12m: new Map(),
  };
  for (const dividend of dividends) {
    if (dividend.paymentDate >= twelveMonthsAgo) {
      stats.dividends12m += dividend.amount;
      stats.byAsset12m.set(
        dividend.assetName,
        (stats.byAsset12m.get(dividend.assetName) ?? 0) + dividend.amount,
      );
    }
    if (dividend.paymentDate >= threeMonthsAgo) {
      stats.dividendsLast3m += dividend.amount;
    }
  }
  return stats;
}

/**
 * Chronological replay of the ledger. One instance per snapshot: `run()` walks
 * every calendar day from the first trade to `today`, and the fields hold the
 * end-of-replay state the holdings and summary are read from.
 */
class PortfolioReplay {
  readonly assets = new Map<string, AssetState>();
  readonly series: SnapshotPoint[] = [];
  readonly benchmarkIds: string[];
  // Benchmarks: one shadow portfolio per index, each receiving exactly the
  // same cash flows on the same days as the real one and compounding at that
  // index's daily return.
  readonly benchmarkValues: Map<string, number>;
  readonly startBenchmarkGains: Map<string, number>;
  netDeposits = 0;
  dividendsAccumulated = 0;
  startGainTotal: number | null = null;
  startDividendsAccumulated = 0;
  // Total-return gain at the end of the day before `today`, so "today's change"
  // is derived from the exact same replay as the period gain — this makes the
  // "hoje" figure identical to the period gain when the selected range is 1d.
  yesterdayGain: number | null = null;

  private readonly yesterdayIso: string;
  private readonly rangeStart: string;
  private readonly replayStart: string;
  private txIndex = 0;
  private divIndex = 0;

  constructor(
    private readonly input: EngineInput,
    private readonly transactions: EngineTransaction[],
    private readonly dividends: EngineDividend[],
  ) {
    this.benchmarkIds = [...input.benchmarks.keys()];
    this.benchmarkValues = new Map(this.benchmarkIds.map((id) => [id, 0]));
    this.startBenchmarkGains = new Map(this.benchmarkIds.map((id) => [id, 0]));
    this.yesterdayIso = addDaysIso(input.today, -1);

    const fullStart = transactions[0]!.transactionDate;
    this.rangeStart = periodStartIso(input.range, input.today) ?? fullStart;
    // The replay always begins at the first transaction so that state (prices,
    // fixed-income accrual, cost basis) is correct when the range window opens.
    this.replayStart =
      fullStart < this.rangeStart ? fullStart : this.rangeStart;
  }

  run(): void {
    // One Date, stepped in place: building a fresh one per day and formatting
    // it through toISOString was the single most expensive operation in this
    // loop, on a loop that runs once per calendar day since the first trade.
    const cursor = new Date(`${this.replayStart}T00:00:00Z`);
    const last = new Date(`${this.input.today}T00:00:00Z`).getTime();
    for (
      ;
      cursor.getTime() <= last;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      const day = isoDayOf(cursor);
      // 1) Accrue daily yield before the day's cash flows.
      this.accrue(day);
      // 2) Apply the day's transactions.
      while (
        this.txIndex < this.transactions.length &&
        this.transactions[this.txIndex]!.transactionDate === day
      ) {
        this.applyTransaction(this.transactions[this.txIndex]!);
        this.txIndex++;
      }
      // 3) Apply the day's dividends.
      while (
        this.divIndex < this.dividends.length &&
        this.dividends[this.divIndex]!.paymentDate === day
      ) {
        this.applyDividend(this.dividends[this.divIndex]!);
        this.divIndex++;
      }
      // 4) Mark market assets to the day's price.
      const totalValue = this.markToMarket(day);
      // 5) Range-start snapshot and series point.
      this.closeDay(day, totalValue);
    }
  }

  /** Benchmark's gain over the range on the same cash flows as the portfolio. */
  benchmarkGain(id: string): number {
    return (
      this.benchmarkValues.get(id)! -
      this.netDeposits -
      this.startBenchmarkGains.get(id)!
    );
  }

  private getAsset(tx: EngineTransaction): AssetState {
    let state = this.assets.get(tx.assetName);
    if (!state) {
      state = newAssetState(tx);
      this.assets.set(tx.assetName, state);
    }
    return state;
  }

  private accrue(day: string): void {
    const { benchmarks } = this.input;
    for (const id of this.benchmarkIds) {
      const rate = benchmarks.get(id)?.get(day) ?? 0;
      this.benchmarkValues.set(id, this.benchmarkValues.get(id)! * (1 + rate));
    }
    // CDI still drives fixed-income accrual, so it is read out by name even
    // though every benchmark compounds generically.
    const cdiRate = benchmarks.get("CDI")?.get(day) ?? 0;
    for (const state of this.assets.values()) {
      // Tesouro is marked to market (step 4), not accrued.
      if (isAccrualFixedIncome(state) && state.quantity > 0) {
        accrueFixedIncome(state, cdiRate);
      }
    }
  }

  /** Move `amount` of cash into (+) or out of (−) every shadow portfolio. */
  private shiftBenchmarks(amount: number): void {
    for (const id of this.benchmarkIds) {
      this.benchmarkValues.set(id, this.benchmarkValues.get(id)! + amount);
    }
  }

  private applyTransaction(tx: EngineTransaction): void {
    const state = this.getAsset(tx);
    if (tx.transactionType === "BUY") {
      applyBuy(state, tx);
      this.netDeposits += tx.totalAmount;
      this.shiftBenchmarks(tx.totalAmount);
    } else {
      applySell(state, tx);
      this.netDeposits -= tx.totalAmount;
      this.shiftBenchmarks(-tx.totalAmount);
    }
  }

  private applyDividend(dividend: EngineDividend): void {
    this.dividendsAccumulated += dividend.amount;
    const state = this.assets.get(dividend.assetName);
    if (state) state.dividendsAccumulated += dividend.amount;
  }

  private candlesFor(assetName: string, state: AssetState) {
    if (state.tesouroTitle) return this.input.tesouroCandles.get(assetName);
    if (state.fundCnpj) return this.input.fundCandles.get(assetName);
    return this.input.candles.get(assetName);
  }

  /**
   * Price one market asset on `day`: forward-filled candles, with today's
   * point preferring the live quote. Tesouro is priced from its official PU
   * series, funds from the CVM quota series, everything else from brapi.
   */
  private priceAsset(assetName: string, state: AssetState, day: string): void {
    forwardFillPrice(state, this.candlesFor(assetName, state), day);
    // Neither Tesouro nor funds have an intraday quote: their last published
    // price *is* the price, and for a fund it is a few days old by design.
    if (day === this.input.today && !state.tesouroTitle && !state.fundCnpj) {
      const quote = this.input.quotes.get(assetName);
      if (quote?.price != null) state.lastPrice = quote.price;
    }
    const fallback = state.quantity > 0 ? state.costBasis / state.quantity : 0;
    state.marketValue = state.quantity * (state.lastPrice ?? fallback);
  }

  /** Mark every asset to the day's price and return the portfolio total. */
  private markToMarket(day: string): number {
    // The day's total is summed in the same pass, rather than in one more walk
    // over every asset afterwards.
    let totalValue = 0;
    for (const [assetName, state] of this.assets) {
      // Accrual fixed income keeps its compounded marketValue (step 1).
      if (!isAccrualFixedIncome(state)) this.priceAsset(assetName, state, day);
      totalValue += state.marketValue;
    }
    return totalValue;
  }

  private closeDay(day: string, totalValue: number): void {
    const totalGain = totalValue + this.dividendsAccumulated - this.netDeposits;
    if (day === this.yesterdayIso) this.yesterdayGain = totalGain;
    if (day < this.rangeStart) return;

    // Snapshot state the first time the replay enters the range window.
    if (this.startGainTotal === null) {
      this.startGainTotal = totalGain;
      this.startDividendsAccumulated = this.dividendsAccumulated;
      for (const id of this.benchmarkIds) {
        this.startBenchmarkGains.set(
          id,
          this.benchmarkValues.get(id)! - this.netDeposits,
        );
      }
      for (const state of this.assets.values()) {
        state.startGain = assetTotalGain(state);
        state.startValue = state.marketValue;
      }
    }

    if (this.input.includeSeries) {
      const benchmarkGains: Record<string, number> = {};
      for (const id of this.benchmarkIds) {
        benchmarkGains[id] = this.benchmarkGain(id);
      }
      this.series.push({
        date: day,
        value: totalValue,
        invested: this.netDeposits,
        gain: totalGain - this.startGainTotal,
        benchmarkGains,
        dividendsAccumulated:
          this.dividendsAccumulated - this.startDividendsAccumulated,
      });
    }
  }
}

function buildHolding(
  assetName: string,
  state: AssetState,
  quote: QuoteResult | undefined,
  input: EngineInput,
  dividends12m: number,
): SnapshotHolding {
  const averageCost = state.costBasis / state.quantity;
  const currentPrice =
    state.quantity > 0 ? state.marketValue / state.quantity : 0;
  const unrealizedGain = state.marketValue - state.costBasis;
  const periodGain = assetTotalGain(state) - state.startGain;
  const periodBase = state.startValue > 0 ? state.startValue : state.costBasis;

  return {
    assetName,
    label: input.assetLabels.get(assetName) ?? null,
    assetTypeId: state.assetTypeId,
    assetTypeName: input.assetTypeNames.get(state.assetTypeId) ?? "Outros",
    quantity: state.quantity,
    averageCost,
    currentPrice,
    priceStatus: priceStatusFor(state, quote),
    priceAsOf: quote?.asOf ? quote.asOf.toISOString() : null,
    currentValue: state.marketValue,
    totalCost: state.costBasis,
    unrealizedGain,
    unrealizedGainPercent:
      state.costBasis > 0 ? (unrealizedGain / state.costBasis) * 100 : 0,
    periodGain,
    periodGainPercent: periodBase > 0 ? (periodGain / periodBase) * 100 : 0,
    dividendsTotal: state.dividendsAccumulated,
    dividends12m,
    isFixedIncome: state.isFixedIncome,
    fixedIncomeYieldType: state.fixedIncomeYieldType,
    fixedIncomeRate: state.fixedIncomeRate,
    fixedIncomeMaturityDate: state.fixedIncomeMaturityDate,
    tesouroTitle: state.tesouroTitle,
    fundCnpj: state.fundCnpj,
  };
}

interface HoldingsResult {
  holdings: SnapshotHolding[];
  issues: PortfolioSnapshot["issues"];
  totalValue: number;
  realizedGainTotal: number;
  quotesAsOf: Date | null;
}

function buildHoldings(
  replay: PortfolioReplay,
  input: EngineInput,
  byAsset12m: Map<string, number>,
): HoldingsResult {
  const result: HoldingsResult = {
    holdings: [],
    issues: [],
    totalValue: 0,
    realizedGainTotal: 0,
    quotesAsOf: null,
  };

  for (const [assetName, state] of replay.assets) {
    result.realizedGainTotal += state.realizedGain;
    if (state.quantity <= 0) continue;

    result.totalValue += state.marketValue;

    const quote =
      state.isFixedIncome || state.fundCnpj
        ? undefined
        : input.quotes.get(assetName);
    if (!state.isFixedIncome && quote && quote.status !== "ok") {
      result.issues.push({
        assetName,
        status: quote.status,
        message: quoteIssueMessage(assetName, quote.status),
      });
    }
    if (quote?.asOf && (!result.quotesAsOf || quote.asOf > result.quotesAsOf)) {
      result.quotesAsOf = quote.asOf;
    }

    result.holdings.push(
      buildHolding(
        assetName,
        state,
        quote,
        input,
        byAsset12m.get(assetName) ?? 0,
      ),
    );
  }

  result.holdings.sort((a, b) => b.currentValue - a.currentValue);
  return result;
}

export function computePortfolioSnapshot(
  input: EngineInput,
): PortfolioSnapshot {
  if (input.transactions.length === 0) return emptySnapshot();

  const transactions = [...input.transactions].sort((a, b) =>
    a.transactionDate.localeCompare(b.transactionDate),
  );
  const sortedDividends = [...input.dividends].sort((a, b) =>
    a.paymentDate.localeCompare(b.paymentDate),
  );

  const replay = new PortfolioReplay(input, transactions, sortedDividends);
  replay.run();

  // ---- Final state → holdings + summary --------------------------------
  const stats = dividendStats(sortedDividends, input.today);
  const { holdings, issues, totalValue, realizedGainTotal, quotesAsOf } =
    buildHoldings(replay, input, stats.byAsset12m);

  const { netDeposits, dividendsAccumulated } = replay;
  const finalGain = totalValue + dividendsAccumulated - netDeposits;
  const periodGain = finalGain - (replay.startGainTotal ?? 0);
  // Invested capital = net deposits (aportes) — the exact quantity the chart
  // plots as "Total Investido" (SnapshotPoint.invested). Reporting it here, and
  // basing the return on it, keeps the "Total Investido" and "Rentabilidade"
  // cards identical to the chart's last point for every range.
  const periodGainPercent =
    netDeposits > 0 ? (periodGain / netDeposits) * 100 : 0;
  // "Today's change" = the 1-day slice of the same replay, so it matches the
  // period gain exactly when the range is 1d (Hoje). Zero if there is no prior
  // day (a portfolio that only starts today).
  const dailyChange =
    replay.yesterdayGain != null ? finalGain - replay.yesterdayGain : 0;

  return {
    holdings,
    summary: {
      totalValue,
      totalInvested: netDeposits,
      periodGain,
      periodGainPercent,
      periodDividends: dividendsAccumulated - replay.startDividendsAccumulated,
      dividends12m: stats.dividends12m,
      monthlyIncome: stats.dividendsLast3m / 3,
      realizedGain: realizedGainTotal,
      dailyChange,
      quotesAsOf: quotesAsOf ? quotesAsOf.toISOString() : null,
      benchmarkGains: Object.fromEntries(
        replay.benchmarkIds.map((id) => [id, replay.benchmarkGain(id)]),
      ),
    },
    series: replay.series,
    issues,
  };
}
