// Thin HTTP client for external market data providers (brapi.dev + BCB).
// No caching and no TRPCError here — callers go through MarketCacheService,
// which owns persistence and error presentation.

/** The requested symbol does not exist at the provider (permanent). */
export class SymbolNotFoundError extends Error {
  constructor(symbol: string) {
    super(`Symbol ${symbol} not found`);
    this.name = "SymbolNotFoundError";
  }
}

/** The provider is unreachable or returned a server error (transient). */
export class MarketUpstreamError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "MarketUpstreamError";
    this.status = status;
  }
}

export interface BrapiQuote {
  symbol: string;
  shortName: string;
  longName: string;
  currency: string;
  regularMarketPrice: number;
  regularMarketPreviousClose: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketTime: string;
}

interface BrapiHistoricalPoint {
  date: number; // unix seconds
  close: number | null;
}

interface BrapiQuoteResponse {
  results?: Array<BrapiQuote & { historicalDataPrice?: BrapiHistoricalPoint[] }>;
}

export interface CandlePoint {
  date: string; // YYYY-MM-DD
  close: number;
}

export interface CdiDailyRate {
  date: string; // YYYY-MM-DD
  dailyRate: number; // decimal, e.g. 0.00051
}

export type BrapiRange =
  | "1d"
  | "5d"
  | "1mo"
  | "3mo"
  | "6mo"
  | "1y"
  | "2y"
  | "5y"
  | "10y"
  | "ytd"
  | "max";

const BRAPI_BASE_URL = "https://brapi.dev/api";
const FETCH_TIMEOUT_MS = 12_000;

function brapiUrl(path: string, params: Record<string, string> = {}): URL {
  const url = new URL(`${BRAPI_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const token = process.env.BRAPI_API_TOKEN;
  if (token) url.searchParams.set("token", token);
  return url;
}

/**
 * fetch with a hard timeout so a stalled upstream can never hang a request
 * (and, in turn, leave the investments page loading forever).
 */
async function fetchWithTimeout(url: string): Promise<Response> {
  return await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

/**
 * Map with bounded concurrency. brapi's free plan serves one ticker per
 * request, so a large portfolio means many small requests — firing them all at
 * once trips rate limiting, so we cap how many are in flight.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]!);
    }
  }
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

const REQUEST_CONCURRENCY = 6;

/**
 * Fetch current quotes for a set of symbols.
 * brapi's free plan allows only ONE ticker per request, so this fans out one
 * request per symbol in parallel. Symbols brapi does not know are simply
 * absent from `quotes` (the caller negative-caches them); symbols that failed
 * for transient reasons are listed in `failed` so they are NOT mistaken for
 * not-found.
 */
export async function fetchQuotes(
  symbols: string[],
): Promise<{ quotes: BrapiQuote[]; failed: string[] }> {
  if (symbols.length === 0) return { quotes: [], failed: [] };

  const results = await mapWithConcurrency(
    symbols,
    REQUEST_CONCURRENCY,
    async (symbol) => {
      let response: Response;
      try {
        response = await fetchWithTimeout(brapiUrl(`/quote/${symbol}`).toString());
      } catch {
        return { symbol, quote: null, transient: true };
      }
      if (response.status === 404) {
        return { symbol, quote: null, transient: false };
      }
      if (!response.ok) {
        return { symbol, quote: null, transient: true };
      }
      const data = (await response.json()) as BrapiQuoteResponse;
      return { symbol, quote: data.results?.[0] ?? null, transient: false };
    },
  );

  const quotes: BrapiQuote[] = [];
  const failed: string[] = [];
  for (const result of results) {
    if (result.quote) quotes.push(result.quote);
    else if (result.transient) failed.push(result.symbol);
  }

  // Everything failing transiently means the provider itself is down.
  if (quotes.length === 0 && failed.length === symbols.length) {
    throw new MarketUpstreamError("brapi unreachable for all symbols");
  }

  return { quotes, failed };
}

/**
 * Fetch daily close candles for one symbol over a brapi range.
 * Throws SymbolNotFoundError when the ticker does not exist.
 */
export async function fetchCandles(
  symbol: string,
  range: BrapiRange,
): Promise<CandlePoint[]> {
  let response: Response;
  try {
    response = await fetchWithTimeout(
      brapiUrl(`/quote/${symbol}`, { range, interval: "1d" }).toString(),
    );
  } catch (error) {
    throw new MarketUpstreamError(`brapi request failed: ${String(error)}`);
  }

  if (response.status === 404) throw new SymbolNotFoundError(symbol);

  if (!response.ok) {
    throw new MarketUpstreamError(
      `brapi candle request for ${symbol} failed with status ${response.status}`,
      response.status,
    );
  }

  const data = (await response.json()) as BrapiQuoteResponse;
  const result = data.results?.[0];
  if (!result) throw new SymbolNotFoundError(symbol);

  return (result.historicalDataPrice ?? [])
    .filter((point) => point.close != null)
    .map((point) => ({
      date: new Date(point.date * 1000).toISOString().slice(0, 10),
      close: point.close!,
    }));
}

/** Search brapi's ticker list. Used by the ticker autocomplete. */
export async function searchStocks(query: string): Promise<
  Array<{ stock: string; name: string; close: number | null; type: string }>
> {
  let response: Response;
  try {
    response = await fetchWithTimeout(
      brapiUrl(`/quote/list`, { search: query, limit: "10" }).toString(),
    );
  } catch (error) {
    throw new MarketUpstreamError(`brapi request failed: ${String(error)}`);
  }

  if (!response.ok) {
    throw new MarketUpstreamError(
      `brapi search request failed with status ${response.status}`,
    );
  }

  const data = (await response.json()) as {
    stocks?: Array<{ stock: string; name: string; close: number | null; type: string }>;
  };
  return data.stocks ?? [];
}

/**
 * Fetch daily CDI rates (BCB SGS series 12) for a date range.
 * Returns business days only; the values are decimal daily rates.
 */
export async function fetchCdiDailyRates(
  startDate: string,
  endDate: string,
): Promise<CdiDailyRate[]> {
  const toBcbDate = (iso: string): string => {
    const [year, month, day] = iso.split("-");
    return `${day}/${month}/${year}`;
  };

  const url = new URL("https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados");
  url.searchParams.set("formato", "json");
  url.searchParams.set("dataInicial", toBcbDate(startDate));
  url.searchParams.set("dataFinal", toBcbDate(endDate));

  let response: Response;
  try {
    response = await fetchWithTimeout(url.toString());
  } catch (error) {
    throw new MarketUpstreamError(`BCB request failed: ${String(error)}`);
  }

  if (!response.ok) {
    throw new MarketUpstreamError(
      `BCB CDI request failed with status ${response.status}`,
    );
  }

  const data = (await response.json()) as Array<{ data: string; valor: string }>;

  return data.map((point) => ({
    date: point.data.split("/").reverse().join("-"),
    dailyRate: parseFloat(point.valor) / 100,
  }));
}
