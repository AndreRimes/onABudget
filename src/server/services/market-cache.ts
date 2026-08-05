// DB-backed cache in front of the external market-data providers.
// Daily candles and CDI rates are immutable → cached forever; live quotes
// have a short TTL; unknown tickers are negative-cached so they don't burn
// requests on every page load.
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "~/server/db";
import {
  benchmarkPoints,
  benchmarkSync,
  cdiRates,
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
  BCB_SERIES,
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

export class MarketCacheService {
  /** symbol -> ISO date of the last candle tail-check, to fetch at most once a day */
  private candlesSyncedOn = new Map<string, string>();
  private cdiSyncedOn: string | null = null;
  /** benchmark id -> epoch ms of the last tail-check, to rate-limit refetches */
  private benchmarkSyncedAt = new Map<string, number>();
  /** tesouro title key -> ISO date of last CSV sync, to fetch at most once a day */
  private tesouroSyncedOn = new Map<string, string>();

  /**
   * Current quotes for a batch of symbols, cache-first.
   * Never throws for the batch: individual symbols degrade to
   * "stale" / "unavailable" / "not_found".
   */
  async getQuotes(symbols: string[]): Promise<Map<string, QuoteResult>> {
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
      const meta = metaBySymbol.get(symbol);
      if (
        meta?.status === "NOT_FOUND" &&
        meta.updatedAt &&
        now - meta.updatedAt.getTime() < NOT_FOUND_TTL_MS
      ) {
        results.set(symbol, {
          price: null,
          previousClose: null,
          status: "not_found",
          asOf: null,
        });
      } else if (
        meta?.lastPrice != null &&
        meta.lastPriceAt &&
        now - meta.lastPriceAt.getTime() < QUOTE_TTL_MS
      ) {
        results.set(symbol, {
          price: meta.lastPrice,
          previousClose: meta.previousClose,
          status: "ok",
          asOf: meta.lastPriceAt,
        });
      } else {
        toFetch.push(symbol);
      }
    }

    if (toFetch.length === 0) return results;

    const fetchedAt = new Date();
    let quoteBySymbol = new Map<string, BrapiQuote>();
    let failedSymbols = new Set<string>();

    try {
      const { quotes, failed } = await fetchQuotes(toFetch);
      // Already keyed by the requested symbol — see fetchQuotes.
      quoteBySymbol = quotes;
      failedSymbols = new Set(failed);
    } catch (error) {
      if (!(error instanceof MarketUpstreamError)) throw error;
      // Every symbol failed transiently (provider unreachable).
      failedSymbols = new Set(toFetch);
    }

    for (const symbol of toFetch) {
      const quote = quoteBySymbol.get(symbol);
      if (quote?.regularMarketPrice != null) {
        await db
          .insert(marketSymbols)
          .values({
            symbol,
            status: "OK",
            lastPrice: quote.regularMarketPrice,
            previousClose: quote.regularMarketPreviousClose ?? null,
            lastPriceAt: fetchedAt,
            updatedAt: fetchedAt,
          })
          .onConflictDoUpdate({
            target: marketSymbols.symbol,
            set: {
              status: "OK",
              lastPrice: quote.regularMarketPrice,
              previousClose: quote.regularMarketPreviousClose ?? null,
              lastPriceAt: fetchedAt,
              updatedAt: fetchedAt,
            },
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
        const meta = metaBySymbol.get(symbol);
        if (meta?.lastPrice != null) {
          results.set(symbol, {
            price: meta.lastPrice,
            previousClose: meta.previousClose,
            status: "stale",
            asOf: meta.lastPriceAt,
          });
        } else {
          results.set(symbol, {
            price: null,
            previousClose: null,
            status: "unavailable",
            asOf: null,
          });
        }
      } else {
        // brapi answered but the symbol is not in its results → it does not exist.
        await db
          .insert(marketSymbols)
          .values({ symbol, status: "NOT_FOUND", updatedAt: fetchedAt })
          .onConflictDoUpdate({
            target: marketSymbols.symbol,
            set: { status: "NOT_FOUND", updatedAt: fetchedAt },
          });
        results.set(symbol, {
          price: null,
          previousClose: null,
          status: "not_found",
          asOf: null,
        });
      }
    }

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
    meta: typeof marketSymbols.$inferSelect | undefined,
  ): Promise<void> {
    if (meta?.status === "NOT_FOUND") return;

    const coverageFrom = meta?.candlesFrom ?? null;
    const coverageTo = meta?.candlesTo ?? null;
    if (this.candlesSyncedOn.get(symbol) === today) return;

    const needsBackfill = !coverageFrom || !coverageTo || fromDate < coverageFrom;
    const needsTailSync = !!coverageTo && coverageTo < today;
    if (!needsBackfill && !needsTailSync) return;

    // Note: a backfill that doesn't reach `fromDate` is not necessarily a bug —
    // brapi's free plan only ever returns the last ~3 months of candles no
    // matter the range requested, so older history is permanently out of reach.
    // The once-per-day guard stops that from becoming a wasted retry.
    const range = rangeForDays(daysBetween(fromDate, today));

    try {
      const candles = await fetchCandles(symbol, range);
      this.candlesSyncedOn.set(symbol, today);
      if (candles.length === 0) return;

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

      const fetchedFrom = candles[0]!.date;
      const fetchedTo = candles[candles.length - 1]!.date;
      const newFrom =
        !coverageFrom || fetchedFrom < coverageFrom ? fetchedFrom : coverageFrom;
      const newTo =
        !coverageTo || fetchedTo > coverageTo ? fetchedTo : coverageTo;
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
          set: { candlesFrom: newFrom, candlesTo: newTo, updatedAt: new Date() },
        });
    } catch (error) {
      if (error instanceof SymbolNotFoundError) {
        await db
          .insert(marketSymbols)
          .values({ symbol, status: "NOT_FOUND", updatedAt: new Date() })
          .onConflictDoUpdate({
            target: marketSymbols.symbol,
            set: { status: "NOT_FOUND", updatedAt: new Date() },
          });
        return;
      }
      if (!(error instanceof MarketUpstreamError)) throw error;
      // Transient failure: don't hammer it again today; serve cached data.
      this.candlesSyncedOn.set(symbol, today);
    }
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

    const missing: Array<[string, string]> = [];
    if (!bounds?.min || !bounds.max) {
      missing.push([fromDate, today]);
    } else {
      if (fromDate < bounds.min) missing.push([fromDate, bounds.min]);
      if (bounds.max < today && this.cdiSyncedOn !== today) {
        missing.push([bounds.max, today]);
      }
    }

    for (const [start, end] of missing) {
      try {
        const rates = await fetchCdiDailyRates(start, end);
        if (rates.length > 0) {
          await db
            .insert(cdiRates)
            .values(
              rates.map((rate) => ({
                date: rate.date,
                dailyRate: rate.dailyRate,
              })),
            )
            .onConflictDoNothing();
        }
      } catch (error) {
        if (!(error instanceof MarketUpstreamError)) throw error;
        // Transient BCB failure: serve what is cached.
      }
    }
    this.cdiSyncedOn = today;

    const rows = await db
      .select()
      .from(cdiRates)
      .where(gte(cdiRates.date, fromDate));

    return new Map(rows.map((row) => [row.date, row.dailyRate]));
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
      ids.map(async (id): Promise<[BenchmarkId, Map<string, number>] | null> => {
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
      }),
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
      const start = coverage && coverage.coversFrom < fromDate
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
              set: { coversFrom: start, coversTo: today, updatedAt: new Date() },
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
  ): Promise<Map<string, CandlePoint[]>> {
    const result = new Map<string, CandlePoint[]>();
    const keys = [...new Set(titleKeys)];
    if (keys.length === 0) return result;

    const today = todayIso();
    const stale = keys.filter((key) => this.tesouroSyncedOn.get(key) !== today);
    if (stale.length > 0) {
      try {
        const prices = await fetchTesouroPrices(new Set(stale), fromDate);
        if (prices.length > 0) {
          await db.insert(tesouroPrices).values(prices).onConflictDoNothing();
        }
        // Mark all requested-and-stale keys as synced even if some matched no
        // rows, so an unmatched title doesn't re-download the CSV every load.
        for (const key of stale) this.tesouroSyncedOn.set(key, today);
      } catch (error) {
        if (!(error instanceof MarketUpstreamError)) throw error;
        // Transient failure: serve whatever is cached and retry next time.
      }
    }

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

    for (const row of rows) {
      const list = result.get(row.titleKey);
      if (list) {
        list.push({ date: row.date, close: row.sellPrice });
      } else {
        result.set(row.titleKey, [{ date: row.date, close: row.sellPrice }]);
      }
    }

    return result;
  }
}

export const marketCacheService = new MarketCacheService();
