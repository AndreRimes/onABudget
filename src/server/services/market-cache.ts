// DB-backed cache in front of the external market-data providers.
// Daily candles and CDI rates are immutable → cached forever; live quotes
// have a short TTL; unknown tickers are negative-cached so they don't burn
// requests on every page load.
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { chunk } from "~/lib/chunk";
import { db } from "~/server/db";
import {
  benchmarkPoints,
  benchmarkSync,
  cdiRates,
  fundQuotaCoverage,
  fundQuotas,
  marketCandles,
  marketSymbols,
  tesouroPrices,
} from "~/server/db/schema";
import type { BenchmarkId } from "~/server/api/investments/benchmarks";
import {
  monthlyRatesToDailyReturns,
  pricesToDailyReturns,
} from "./benchmark-math";
import {
  marketCacheLookups,
  marketQuoteResults,
  marketSyncTotal,
} from "~/server/metrics/instruments";
import { BCB_SERIES } from "./brapi";
import {
  type BrapiQuote,
  type BrapiRange,
  type CandlePoint,
  MarketUpstreamError,
  SymbolNotFoundError,
  fetchBcbMonthlyRates,
  fetchCandles,
  fetchCdiDailyRates,
  fetchQuotes,
  fetchTesouroPrices,
  fetchYahooDailyCloses,
  mapWithConcurrency,
} from "./brapi";
import { fetchFundQuotas } from "./cvm-funds";

const CANDLE_CONCURRENCY = 6;

const QUOTE_TTL_MS = 15 * 60 * 1000;
const NOT_FOUND_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * How long the tail of a live-price benchmark stays trusted. Same TTL as
 * quotes, and for the same reason: today's point is provisional while the
 * market is open — before the open it doesn't exist at all, and after it the
 * value keeps moving until the close.
 */
const BENCHMARK_TAIL_TTL_MS = QUOTE_TTL_MS;

/**
 * Benchmarks whose series comes from a live price feed, so the last point is
 * provisional intraday. The rest (IPCA, poupança) are monthly prints spread
 * pro rata: missing recent days are expected and refetching cannot fill them.
 */
const LIVE_TAIL_BENCHMARKS = new Set<BenchmarkId>(["IBOV"]);

export type QuoteStatus = "ok" | "stale" | "not_found" | "unavailable";

export interface RefreshOptions {
  /**
   * Ignore every cache guard (quote TTL, negative cache, once-a-day sync) and
   * go straight to the provider. For the "atualizar cotação" action: the user
   * asked for a price as of *now*, so a cached one is not an answer.
   */
  force?: boolean;
}

export interface QuoteResult {
  price: number | null;
  previousClose: number | null;
  status: QuoteStatus;
  asOf: Date | null;
}

/** Local-timezone calendar date, so "today" never rolls over early via UTC. */
export function todayIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

/** Local-timezone calendar date of an epoch-ms instant (0 = never). */
function isoDayOf(ms: number): string {
  if (ms === 0) return "";
  return new Date(ms - new Date(ms).getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * How long a single request may spend backfilling CVM monthly files before it
 * gives up and serves what it has. One month costs a ~10 MB download, so a
 * fund held for two years cannot be filled in one page load — and should not
 * hold one up either.
 */
const FUND_BACKFILL_BUDGET_MS = 20_000;

/** Rows per INSERT — one fund-month is ~22 rows, so this is many months. */
const FUND_QUOTA_CHUNK_SIZE = 500;

/** Every YYYY-MM from `from` to `to`, inclusive and ascending. */
function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  let [year, month] = from.split("-").map(Number) as [number, number];
  while (`${year}-${String(month).padStart(2, "0")}` <= to) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
    // A malformed `from` must not spin forever.
    if (months.length > 600) break;
  }
  return months;
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.ceil(
    (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000,
  );
}

/**
 * Smallest brapi range that covers `days` of history, capped to what brapi's
 * free plan actually allows for the /quote candle endpoint: 1d, 5d, 1mo, 3mo
 * (verified against the live API — larger ranges respond 400 INVALID_RANGE).
 * Requesting more than 3 months of history simply is not possible on the
 * free plan; the engine already falls back to average cost for dates the
 * cache has no candle for, so this degrades gracefully. Widen this if the
 * account moves to a paid brapi plan.
 */
function rangeForDays(days: number): BrapiRange {
  if (days <= 5) return "5d";
  if (days <= 25) return "1mo";
  return "3mo";
}

type MarketSymbolMeta = typeof marketSymbols.$inferSelect;

const NOT_FOUND_QUOTE: QuoteResult = {
  price: null,
  previousClose: null,
  status: "not_found",
  asOf: null,
};

/**
 * The cached answer for a symbol, or null when it has to be fetched: a fresh
 * price, or a "not found" verdict still within its negative-cache window.
 */
function cachedQuote(
  meta: MarketSymbolMeta | undefined,
  now: number,
): QuoteResult | null {
  if (
    meta?.status === "NOT_FOUND" &&
    meta.updatedAt &&
    now - meta.updatedAt.getTime() < NOT_FOUND_TTL_MS
  ) {
    marketCacheLookups.inc({ kind: "quote", result: "negative_hit" });
    return NOT_FOUND_QUOTE;
  }
  if (
    meta?.lastPrice != null &&
    meta.lastPriceAt &&
    now - meta.lastPriceAt.getTime() < QUOTE_TTL_MS
  ) {
    marketCacheLookups.inc({ kind: "quote", result: "hit" });
    return {
      price: meta.lastPrice,
      previousClose: meta.previousClose,
      status: "ok",
      asOf: meta.lastPriceAt,
    };
  }
  marketCacheLookups.inc({ kind: "quote", result: "miss" });
  return null;
}

/** Last known price served as "stale", or "unavailable" when there is none. */
function lastKnownQuote(meta: MarketSymbolMeta | undefined): QuoteResult {
  if (meta?.lastPrice != null) {
    return {
      price: meta.lastPrice,
      previousClose: meta.previousClose,
      status: "stale",
      asOf: meta.lastPriceAt,
    };
  }
  return {
    price: null,
    previousClose: null,
    status: "unavailable",
    asOf: null,
  };
}

/**
 * fetchQuotes, with a provider outage reported as "every symbol failed
 * transiently" instead of an exception. Anything else still throws.
 */
async function fetchQuotesTolerant(symbols: string[]): Promise<{
  quoteBySymbol: Map<string, BrapiQuote>;
  failedSymbols: Set<string>;
}> {
  try {
    const { quotes, failed } = await fetchQuotes(symbols);
    // Already keyed by the requested symbol — see fetchQuotes.
    return { quoteBySymbol: quotes, failedSymbols: new Set(failed) };
  } catch (error) {
    if (!(error instanceof MarketUpstreamError)) throw error;
    return { quoteBySymbol: new Map(), failedSymbols: new Set(symbols) };
  }
}

async function persistQuoteRows(
  found: Array<typeof marketSymbols.$inferInsert>,
  notFound: Array<typeof marketSymbols.$inferInsert>,
  fetchedAt: Date,
): Promise<void> {
  if (found.length > 0) {
    await db
      .insert(marketSymbols)
      .values(found)
      .onConflictDoUpdate({
        target: marketSymbols.symbol,
        set: {
          status: "OK",
          lastPrice: sql`excluded.last_price`,
          previousClose: sql`excluded.previous_close`,
          lastPriceAt: sql`excluded.last_price_at`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }
  // A symbol that stopped existing keeps its last known price on the row;
  // only the status and the timestamp move, as before.
  if (notFound.length > 0) {
    await db
      .insert(marketSymbols)
      .values(notFound)
      .onConflictDoUpdate({
        target: marketSymbols.symbol,
        set: { status: "NOT_FOUND", updatedAt: fetchedAt },
      });
  }
}

/** Store fetched candles and widen the symbol's recorded coverage window. */
async function persistCandles(
  symbol: string,
  candles: CandlePoint[],
  meta: MarketSymbolMeta | undefined,
): Promise<void> {
  await db
    .insert(marketCandles)
    .values(
      candles.map((candle) => ({
        symbol,
        date: candle.date,
        close: candle.close,
      })),
    )
    .onConflictDoNothing();

  const coverageFrom = meta?.candlesFrom ?? null;
  const coverageTo = meta?.candlesTo ?? null;
  const fetchedFrom = candles[0]!.date;
  const fetchedTo = candles.at(-1)!.date;
  const newFrom =
    !coverageFrom || fetchedFrom < coverageFrom ? fetchedFrom : coverageFrom;
  const newTo = !coverageTo || fetchedTo > coverageTo ? fetchedTo : coverageTo;
  await db
    .insert(marketSymbols)
    .values({
      symbol,
      status: "OK",
      candlesFrom: newFrom,
      candlesTo: newTo,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: marketSymbols.symbol,
      set: {
        candlesFrom: newFrom,
        candlesTo: newTo,
        updatedAt: new Date(),
      },
    });
}

async function markSymbolNotFound(symbol: string): Promise<void> {
  await db
    .insert(marketSymbols)
    .values({ symbol, status: "NOT_FOUND", updatedAt: new Date() })
    .onConflictDoUpdate({
      target: marketSymbols.symbol,
      set: { status: "NOT_FOUND", updatedAt: new Date() },
    });
}

/** Group date-ordered rows into one CandlePoint series per key. */
function groupSeries<T extends { date: string }>(
  rows: T[],
  keyOf: (row: T) => string,
  closeOf: (row: T) => number,
): Map<string, CandlePoint[]> {
  const result = new Map<string, CandlePoint[]>();
  for (const row of rows) {
    const point = { date: row.date, close: closeOf(row) };
    const list = result.get(keyOf(row));
    if (list) list.push(point);
    else result.set(keyOf(row), [point]);
  }
  return result;
}

/** Fetch and store one range of daily CDI rates. Never throws transiently. */
async function syncCdiRange(start: string, end: string): Promise<void> {
  try {
    const rates = await fetchCdiDailyRates(start, end);
    marketSyncTotal.inc({
      kind: "cdi",
      outcome: rates.length > 0 ? "success" : "empty",
    });
    if (rates.length > 0) {
      await db
        .insert(cdiRates)
        .values(
          rates.map((rate) => ({ date: rate.date, dailyRate: rate.dailyRate })),
        )
        .onConflictDoNothing();
    }
  } catch (error) {
    if (!(error instanceof MarketUpstreamError)) throw error;
    marketSyncTotal.inc({ kind: "cdi", outcome: "upstream_error" });
    // Transient BCB failure: serve what is cached.
  }
}

export class MarketCacheService {
  /** symbol -> ISO date of the last candle tail-check, to fetch at most once a day */
  private readonly candlesSyncedOn = new Map<string, string>();
  private cdiSyncedOn: string | null = null;
  /** benchmark id -> epoch ms of the last tail-check, to rate-limit refetches */
  private readonly benchmarkSyncedAt = new Map<string, number>();
  /** tesouro title key -> ISO date of last CSV sync, to fetch at most once a day */
  private readonly tesouroSyncedOn = new Map<string, string>();
  /** CVM month (YYYY-MM) -> ISO date it was last downloaded, same reason */
  private readonly fundMonthSyncedOn = new Map<string, string>();

  /**
   * Records the freshness of what callers actually got. This is the
   * authoritative "not found" signal — brapi answers 200 with an empty result
   * set for unknown tickers, which the HTTP-level metric counts as a success.
   */
  private recordQuoteResults(results: Map<string, QuoteResult>): void {
    for (const { status } of results.values()) {
      marketQuoteResults.inc({ status });
    }
  }

  /**
   * Current quotes for a batch of symbols, cache-first (`force` bypasses the
   * cache entirely). Never throws for the batch: individual symbols degrade to
   * "stale" / "unavailable" / "not_found".
   */
  async getQuotes(
    symbols: string[],
    { force = false }: RefreshOptions = {},
  ): Promise<Map<string, QuoteResult>> {
    const results = new Map<string, QuoteResult>();
    if (symbols.length === 0) return results;

    const now = Date.now();
    const metas = await db
      .select()
      .from(marketSymbols)
      .where(inArray(marketSymbols.symbol, symbols));
    const metaBySymbol = new Map(metas.map((m) => [m.symbol, m]));

    const toFetch: string[] = [];
    for (const symbol of symbols) {
      // On a forced fetch `meta` is still kept around: a fetch that fails
      // transiently falls back to the last known price, same as a normal one.
      const cached = force ? null : cachedQuote(metaBySymbol.get(symbol), now);
      if (cached) results.set(symbol, cached);
      else toFetch.push(symbol);
    }

    if (toFetch.length === 0) {
      this.recordQuoteResults(results);
      return results;
    }

    const fetchedAt = new Date();
    const { quoteBySymbol, failedSymbols } = await fetchQuotesTolerant(toFetch);

    // Rows to write are collected and upserted in one statement at the end:
    // a cold portfolio of forty tickers used to cost forty serialized writes
    // on top of the forty fetches, inside the request that renders the page.
    const found: Array<typeof marketSymbols.$inferInsert> = [];
    const notFound: Array<typeof marketSymbols.$inferInsert> = [];

    for (const symbol of toFetch) {
      const quote = quoteBySymbol.get(symbol);
      if (quote?.regularMarketPrice != null) {
        found.push({
          symbol,
          status: "OK",
          lastPrice: quote.regularMarketPrice,
          previousClose: quote.regularMarketPreviousClose ?? null,
          lastPriceAt: fetchedAt,
          updatedAt: fetchedAt,
        });
        results.set(symbol, {
          price: quote.regularMarketPrice,
          previousClose: quote.regularMarketPreviousClose ?? null,
          status: "ok",
          asOf: fetchedAt,
        });
      } else if (failedSymbols.has(symbol)) {
        // Transient failure for this symbol specifically: do NOT negative
        // cache — serve the last known price as "stale" if we have one.
        results.set(symbol, lastKnownQuote(metaBySymbol.get(symbol)));
      } else {
        // brapi answered but the symbol is not in its results → it does not exist.
        notFound.push({ symbol, status: "NOT_FOUND", updatedAt: fetchedAt });
        results.set(symbol, NOT_FOUND_QUOTE);
      }
    }

    await persistQuoteRows(found, notFound, fetchedAt);

    this.recordQuoteResults(results);
    return results;
  }

  /**
   * Daily close candles for each symbol from `fromDate` (inclusive) to today,
   * fetching only date ranges the cache does not cover yet.
   */
  async getCandles(
    symbols: string[],
    fromDate: string,
  ): Promise<Map<string, CandlePoint[]>> {
    const result = new Map<string, CandlePoint[]>();
    if (symbols.length === 0) return result;

    const today = todayIso();
    const metas = await db
      .select()
      .from(marketSymbols)
      .where(inArray(marketSymbols.symbol, symbols));
    const metaBySymbol = new Map(metas.map((m) => [m.symbol, m]));

    // Fetch symbols that need (back)filling with bounded concurrency — one slow
    // ticker no longer blocks the rest, and we don't storm the free-tier API.
    await mapWithConcurrency(symbols, CANDLE_CONCURRENCY, (symbol) =>
      this.syncCandles(symbol, fromDate, today, metaBySymbol.get(symbol)),
    );

    const rows = await db
      .select()
      .from(marketCandles)
      .where(
        and(
          inArray(marketCandles.symbol, symbols),
          gte(marketCandles.date, fromDate),
        ),
      )
      .orderBy(asc(marketCandles.date));

    for (const row of rows) {
      const list = result.get(row.symbol);
      if (list) {
        list.push({ date: row.date, close: row.close });
      } else {
        result.set(row.symbol, [{ date: row.date, close: row.close }]);
      }
    }

    return result;
  }

  /** Fetch + persist any missing candles for one symbol. Never throws. */
  private async syncCandles(
    symbol: string,
    fromDate: string,
    today: string,
    meta: MarketSymbolMeta | undefined,
  ): Promise<void> {
    const result = this.candleCacheResult(symbol, fromDate, today, meta);
    marketCacheLookups.inc({ kind: "candles", result });
    if (result !== "miss") return;

    // Note: a backfill that doesn't reach `fromDate` is not necessarily a bug —
    // brapi's free plan only ever returns the last ~3 months of candles no
    // matter the range requested, so older history is permanently out of reach.
    // The once-per-day guard stops that from becoming a wasted retry.
    const range = rangeForDays(daysBetween(fromDate, today));

    try {
      const candles = await fetchCandles(symbol, range);
      this.candlesSyncedOn.set(symbol, today);
      marketSyncTotal.inc({
        kind: "candles",
        outcome: candles.length === 0 ? "empty" : "success",
      });
      if (candles.length === 0) return;
      await persistCandles(symbol, candles, meta);
    } catch (error) {
      if (error instanceof SymbolNotFoundError) {
        marketSyncTotal.inc({ kind: "candles", outcome: "not_found" });
        await markSymbolNotFound(symbol);
        return;
      }
      if (!(error instanceof MarketUpstreamError)) throw error;
      marketSyncTotal.inc({ kind: "candles", outcome: "upstream_error" });
      // Transient failure: don't hammer it again today; serve cached data.
      this.candlesSyncedOn.set(symbol, today);
    }
  }

  /** Whether the candle cache already answers `[fromDate, today]` for `symbol`. */
  private candleCacheResult(
    symbol: string,
    fromDate: string,
    today: string,
    meta: MarketSymbolMeta | undefined,
  ): "negative_hit" | "daily_guard_hit" | "hit" | "miss" {
    if (meta?.status === "NOT_FOUND") return "negative_hit";
    if (this.candlesSyncedOn.get(symbol) === today) return "daily_guard_hit";
    const coverageFrom = meta?.candlesFrom ?? null;
    const coverageTo = meta?.candlesTo ?? null;
    const needsBackfill =
      !coverageFrom || !coverageTo || fromDate < coverageFrom;
    const needsTailSync = !!coverageTo && coverageTo < today;
    return needsBackfill || needsTailSync ? "miss" : "hit";
  }

  /**
   * Daily CDI rates (decimal) from `fromDate` to today, keyed by ISO date.
   * Business days only — absent dates mean no accrual.
   */
  async getCdiRates(fromDate: string): Promise<Map<string, number>> {
    const today = todayIso();

    const [bounds] = await db
      .select({
        min: sql<string | null>`MIN(${cdiRates.date})`,
        max: sql<string | null>`MAX(${cdiRates.date})`,
      })
      .from(cdiRates);

    const missing = this.missingCdiRanges(bounds, fromDate, today);
    if (missing.length === 0) {
      marketCacheLookups.inc({ kind: "cdi", result: "hit" });
    } else {
      marketCacheLookups.inc({ kind: "cdi", result: "miss" }, missing.length);
    }

    for (const [start, end] of missing) await syncCdiRange(start, end);
    this.cdiSyncedOn = today;

    const rows = await db
      .select()
      .from(cdiRates)
      .where(gte(cdiRates.date, fromDate));

    return new Map(rows.map((row) => [row.date, row.dailyRate]));
  }

  /** Date ranges of `[fromDate, today]` the CDI table does not cover yet. */
  private missingCdiRanges(
    bounds: { min: string | null; max: string | null } | undefined,
    fromDate: string,
    today: string,
  ): Array<[string, string]> {
    if (!bounds?.min || !bounds.max) return [[fromDate, today]];
    const missing: Array<[string, string]> = [];
    if (fromDate < bounds.min) missing.push([fromDate, bounds.min]);
    if (bounds.max < today) {
      if (this.cdiSyncedOn === today) {
        // Tail is stale but already checked today — the guard that keeps the
        // BCB request count down.
        marketCacheLookups.inc({ kind: "cdi", result: "daily_guard_hit" });
      } else {
        missing.push([bounds.max, today]);
      }
    }
    return missing;
  }

  /**
   * Daily returns for every requested benchmark, keyed by id then ISO date.
   *
   * Upstream shapes differ wildly — CDI is a daily percentage, Ibovespa is an
   * index price series, IPCA and poupança are monthly prints — so each is
   * normalised to "what one day was worth" here. That leaves the engine with a
   * single uniform input and no per-benchmark special cases.
   *
   * Never throws: a benchmark whose provider is down is simply absent from the
   * result, and the chart drops that line instead of failing the whole page.
   */
  async getBenchmarks(
    ids: BenchmarkId[],
    fromDate: string,
  ): Promise<Map<BenchmarkId, Map<string, number>>> {
    const entries = await Promise.all(
      ids.map(
        async (id): Promise<[BenchmarkId, Map<string, number>] | null> => {
          try {
            // CDI predates this table and already holds full history in
            // `cdi_rates`, so it keeps its own (already correct) path.
            const returns =
              id === "CDI"
                ? await this.getCdiRates(fromDate)
                : await this.getBenchmarkReturns(id, fromDate);
            return returns.size > 0 ? [id, returns] : null;
          } catch (error) {
            if (!(error instanceof MarketUpstreamError)) throw error;
            return null;
          }
        },
      ),
    );

    return new Map(
      entries.filter((entry): entry is [BenchmarkId, Map<string, number>] =>
        Boolean(entry),
      ),
    );
  }

  /** Cache-first daily returns for one non-CDI benchmark. */
  private async getBenchmarkReturns(
    id: BenchmarkId,
    fromDate: string,
  ): Promise<Map<string, number>> {
    const today = todayIso();

    const [coverage] = await db
      .select()
      .from(benchmarkSync)
      .where(eq(benchmarkSync.benchmarkId, id));

    const needsBackfill = !coverage || fromDate < coverage.coversFrom;
    // `coversTo` records how far we *asked* upstream, not how far it answered:
    // a sync that runs before the market opens legitimately gets no point for
    // today. So it can't be the only tail signal — otherwise the first load of
    // the day would freeze the benchmark a day behind until tomorrow, showing
    // a flat zero for today while the index moves. For live-price series the
    // tail therefore expires on a TTL instead.
    const lastSync = this.benchmarkSyncedAt.get(id) ?? 0;
    const needsTail =
      !!coverage &&
      (LIVE_TAIL_BENCHMARKS.has(id)
        ? Date.now() - lastSync > BENCHMARK_TAIL_TTL_MS
        : coverage.coversTo < today && isoDayOf(lastSync) !== today);

    if (needsBackfill || needsTail) {
      // Always refetch the whole window rather than stitching edges: these
      // series are small (one point per day) and a single window keeps the
      // day-over-day return maths correct across the seam.
      const start =
        coverage && coverage.coversFrom < fromDate
          ? coverage.coversFrom
          : fromDate;
      // Record the attempt up front so a failing provider is retried on the
      // next TTL rather than on every page load.
      this.benchmarkSyncedAt.set(id, Date.now());
      try {
        const points = await this.fetchBenchmarkReturns(id, start, today);
        if (points.length > 0) {
          await db
            .insert(benchmarkPoints)
            .values(
              points.map((point) => ({
                benchmarkId: id,
                date: point.date,
                dailyReturn: point.dailyReturn,
              })),
            )
            // Overwrite rather than ignore: today's return is recomputed from a
            // still-moving close, so the stored value has to follow it. Closed
            // days re-resolve to the same number, so this is a no-op for them.
            .onConflictDoUpdate({
              target: [benchmarkPoints.benchmarkId, benchmarkPoints.date],
              set: { dailyReturn: sql`excluded.daily_return` },
            });
          await db
            .insert(benchmarkSync)
            .values({
              benchmarkId: id,
              coversFrom: start,
              coversTo: today,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: benchmarkSync.benchmarkId,
              set: {
                coversFrom: start,
                coversTo: today,
                updatedAt: new Date(),
              },
            });
        }
      } catch (error) {
        if (!(error instanceof MarketUpstreamError)) throw error;
        // Transient upstream failure: serve whatever is already cached.
      }
    }

    const rows = await db
      .select()
      .from(benchmarkPoints)
      .where(
        and(
          eq(benchmarkPoints.benchmarkId, id),
          gte(benchmarkPoints.date, fromDate),
        ),
      );

    return new Map(rows.map((row) => [row.date, row.dailyReturn]));
  }

  /** Provider call + normalisation to daily returns for one benchmark. */
  private async fetchBenchmarkReturns(
    id: BenchmarkId,
    startDate: string,
    endDate: string,
  ): Promise<Array<{ date: string; dailyReturn: number }>> {
    if (id === "IBOV") {
      // brapi caps historical range at 3 months even with a token, which would
      // leave the 6mo/1y/max chart ranges with no benchmark line, so index
      // history comes from Yahoo instead.
      const closes = await fetchYahooDailyCloses("^BVSP", startDate);
      return pricesToDailyReturns(closes);
    }

    const series =
      id === "IPCA" ? BCB_SERIES.IPCA_MONTHLY : BCB_SERIES.POUPANCA_MONTHLY;
    const months = await fetchBcbMonthlyRates(series, startDate, endDate);
    return monthlyRatesToDailyReturns(months, endDate);
  }

  /**
   * Official daily Tesouro Direto resale prices (PU Venda) for the given title
   * keys, from `fromDate` to today, as a candle-like series per title. One CSV
   * download covers every title, so it is fetched at most once per day per key.
   */
  async getTesouroPrices(
    titleKeys: string[],
    fromDate: string,
    { force = false }: RefreshOptions = {},
  ): Promise<Map<string, CandlePoint[]>> {
    const keys = [...new Set(titleKeys)];
    if (keys.length === 0) return new Map();

    const today = todayIso();
    const stale = force
      ? keys
      : keys.filter((key) => this.tesouroSyncedOn.get(key) !== today);
    if (stale.length > 0) await this.syncTesouroPrices(stale, fromDate, today);

    const rows = await db
      .select()
      .from(tesouroPrices)
      .where(
        and(
          inArray(tesouroPrices.titleKey, keys),
          gte(tesouroPrices.date, fromDate),
        ),
      )
      .orderBy(asc(tesouroPrices.date));

    return groupSeries(
      rows,
      (row) => row.titleKey,
      (row) => row.sellPrice,
    );
  }

  /** Download and store the PU series for `keys`. Never throws transiently. */
  private async syncTesouroPrices(
    keys: string[],
    fromDate: string,
    today: string,
  ): Promise<void> {
    try {
      const prices = await fetchTesouroPrices(new Set(keys), fromDate);
      if (prices.length > 0) {
        await db.insert(tesouroPrices).values(prices).onConflictDoNothing();
      }
      // Mark all requested-and-stale keys as synced even if some matched no
      // rows, so an unmatched title doesn't re-download the CSV every load.
      for (const key of keys) this.tesouroSyncedOn.set(key, today);
    } catch (error) {
      if (!(error instanceof MarketUpstreamError)) throw error;
      // Transient failure: serve whatever is cached and retry next time.
    }
  }

  /**
   * Official daily quota values for the given funds, as a candle-like series
   * per CNPJ — the fund equivalent of `getTesouroPrices`.
   *
   * The CVM publishes one file per calendar month covering every fund in the
   * country, so the unit of work is (fund, month) and each pair is downloaded
   * at most once, ever, except the current month, which is re-read once a day
   * as new days are appended to it.
   *
   * A first load for a long-held fund therefore has a year of months to fetch.
   * Rather than make the user wait for all of them, the backfill runs newest
   * month first under a wall-clock budget and stops when it runs out: the
   * chart gets its recent history immediately, and the older months fill in
   * over the next few loads. Anything already cached is served regardless.
   */
  async getFundQuotas(
    cnpjs: string[],
    fromDate: string,
    {
      force = false,
      referenceQuotas,
      budgetMs = FUND_BACKFILL_BUDGET_MS,
    }: RefreshOptions & {
      /** CNPJ -> quota the provider reports, to pick between subclasses. */
      referenceQuotas?: Map<string, number>;
      budgetMs?: number;
    } = {},
  ): Promise<Map<string, CandlePoint[]>> {
    const wanted = [...new Set(cnpjs)].filter((cnpj) => cnpj.length === 14);
    if (wanted.length === 0) return new Map();

    const today = todayIso();
    const pending = await this.pendingFundMonths(
      wanted,
      fromDate,
      today,
      force,
    );

    const deadline = Date.now() + budgetMs;
    // Newest month first: the most recent quotas matter most under a budget.
    for (const month of [...pending.keys()].sort((a, b) =>
      b.localeCompare(a),
    )) {
      if (Date.now() > deadline) break;
      await this.syncFundMonth(pending.get(month)!, month, {
        fromDate,
        today,
        referenceQuotas,
      });
    }

    const rows = await db
      .select()
      .from(fundQuotas)
      .where(
        and(inArray(fundQuotas.cnpj, wanted), gte(fundQuotas.date, fromDate)),
      )
      .orderBy(asc(fundQuotas.date));

    return groupSeries(
      rows,
      (row) => row.cnpj,
      (row) => row.quota,
    );
  }

  /** month -> CNPJs whose quotas for that month still have to be read. */
  private async pendingFundMonths(
    wanted: string[],
    fromDate: string,
    today: string,
    force: boolean,
  ): Promise<Map<string, string[]>> {
    const currentMonth = today.slice(0, 7);
    const months = monthsBetween(fromDate.slice(0, 7), currentMonth);

    const covered = new Set(
      (
        await db
          .select({
            cnpj: fundQuotaCoverage.cnpj,
            month: fundQuotaCoverage.month,
          })
          .from(fundQuotaCoverage)
          .where(inArray(fundQuotaCoverage.cnpj, wanted))
      ).map((row) => `${row.cnpj}:${row.month}`),
    );

    const pending = new Map<string, string[]>();
    for (const month of months) {
      // The running month is never "done": it grows by a row per business day.
      const alwaysStale =
        month === currentMonth && this.fundMonthSyncedOn.get(month) !== today;
      const missing = wanted.filter(
        (cnpj) => force || alwaysStale || !covered.has(`${cnpj}:${month}`),
      );
      if (missing.length > 0) pending.set(month, missing);
    }
    return pending;
  }

  /** Download one CVM monthly file and store the quotas of `funds`. */
  private async syncFundMonth(
    funds: string[],
    month: string,
    {
      fromDate,
      today,
      referenceQuotas,
    }: {
      fromDate: string;
      today: string;
      referenceQuotas?: Map<string, number>;
    },
  ): Promise<void> {
    try {
      const points = await fetchFundQuotas({
        cnpjs: new Set(funds),
        month,
        fromDate,
        referenceQuotas,
      });
      marketSyncTotal.inc({
        kind: "fund_quotas",
        outcome: points.length > 0 ? "success" : "empty",
      });
      for (const batch of chunk(points, FUND_QUOTA_CHUNK_SIZE)) {
        await db
          .insert(fundQuotas)
          .values(
            batch.map((point) => ({
              cnpj: point.cnpj,
              date: point.date,
              quota: point.quota,
            })),
          )
          .onConflictDoNothing();
      }
      // Mark every requested fund, including ones this month said nothing
      // about: a fund that did not exist yet must not re-download the file
      // on every page load looking for itself.
      await db
        .insert(fundQuotaCoverage)
        .values(funds.map((cnpj) => ({ cnpj, month, fetchedAt: new Date() })))
        .onConflictDoUpdate({
          target: [fundQuotaCoverage.cnpj, fundQuotaCoverage.month],
          set: { fetchedAt: new Date() },
        });
      this.fundMonthSyncedOn.set(month, today);
    } catch (error) {
      if (!(error instanceof MarketUpstreamError)) throw error;
      marketSyncTotal.inc({ kind: "fund_quotas", outcome: "upstream_error" });
      // Transient failure: serve what is cached and retry on the next load.
    }
  }
}

export const marketCacheService = new MarketCacheService();
