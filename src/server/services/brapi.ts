// src/server/services/market-data.service.ts
import { TRPCError } from "@trpc/server";

interface BrapiStockQuote {
  symbol: string;
  shortName: string;
  longName: string;
  currency: string;
  regularMarketPrice: number;
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
  regularMarketDayRange: string;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketTime: string;
  marketCap: number;
  regularMarketVolume: number;
  regularMarketPreviousClose: number;
  regularMarketOpen: number;
  averageDailyVolume10Day: number;
  averageDailyVolume3Month: number;
  fiftyTwoWeekLowChange: number;
  fiftyTwoWeekLowChangePercent: number;
  fiftyTwoWeekRange: string;
  fiftyTwoWeekHighChange: number;
  fiftyTwoWeekHighChangePercent: number;
  fiftyTwoWeekLow: number;
  fiftyTwoWeekHigh: number;
  twoHundredDayAverage: number;
  twoHundredDayAverageChange: number;
  twoHundredDayAverageChangePercent: number;
}

interface BrapiResponse {
  results: BrapiStockQuote[];
  requestedAt: string;
  took: string;
}

interface HistoricalDataPoint {
  date: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjustedClose: number;
}

interface BrapiHistoricalResponse {
  results: Array<{
    symbol: string;
    historicalDataPrice: HistoricalDataPoint[];
  }>;
}

interface CDIDataPoint {
  date: string;
  value: number;
}

export class MarketDataService {
  private readonly BRAPI_BASE_URL = "https://brapi.dev/api";
  private readonly BRAPI_TOKEN = process.env.BRAPI_API_TOKEN; // Optional, for higher rate limits

  /**
   * Get current quote for a single stock
   */
  async getQuote(symbol: string): Promise<BrapiStockQuote> {
    try {
      const url = new URL(`${this.BRAPI_BASE_URL}/quote/${symbol}`);

      if (this.BRAPI_TOKEN) {
        url.searchParams.set("token", this.BRAPI_TOKEN);
      }

      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch quote for ${symbol}`,
        });
      }

      const data = (await response.json()) as BrapiResponse;

      if (!data.results || data.results.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Stock ${symbol} not found`,
        });
      }

      return data.results[0]!;
    } catch (error) {
      if (error instanceof TRPCError) throw error;

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Error fetching quote: ${String(error)}`,
      });
    }
  }

  /**
   * Get current quotes for multiple stocks
   */
  async getQuotes(symbols: string[]): Promise<Record<string, number>> {
    try {
      const symbolsParam = symbols.join(",");
      const url = new URL(`${this.BRAPI_BASE_URL}/quote/${symbolsParam}`);

      if (this.BRAPI_TOKEN) {
        url.searchParams.set("token", this.BRAPI_TOKEN);
      }

      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch quotes",
        });
      }

      const data = (await response.json()) as BrapiResponse;

      const prices: Record<string, number> = {};

      for (const quote of data.results) {
        prices[quote.symbol] = quote.regularMarketPrice;
      }

      return prices;
    } catch (error) {
      if (error instanceof TRPCError) throw error;

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Error fetching quotes: ${String(error)}`,
      });
    }
  }

  /**
   * Get historical data for a stock
   * @param symbol - Stock symbol (e.g., "PETR4")
   * @param range - Time range: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max
   * @param interval - Data interval: 1d, 1wk, 1mo
   */
  async getHistoricalData(
    symbol: string,
    range = "1y",
    interval = "1d",
  ): Promise<HistoricalDataPoint[]> {
    try {
      const url = new URL(`${this.BRAPI_BASE_URL}/quote/${symbol}`);
      url.searchParams.set("range", range);
      url.searchParams.set("interval", interval);

      if (this.BRAPI_TOKEN) {
        url.searchParams.set("token", this.BRAPI_TOKEN);
      }

      const response = await fetch(url.toString());

      if (!response.ok) {
        const errorBody = await response.text();
        console.warn(`Brapi error for ${symbol} (${response.status}): ${errorBody}`);
        if (response.status === 404) {
          return [];
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch historical data for ${symbol}: ${response.status} - ${errorBody}`,
        });
      }

      const data = (await response.json()) as BrapiHistoricalResponse;

      if (!data.results || data.results.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Historical data for ${symbol} not found`,
        });
      }

      return data.results[0]!.historicalDataPrice;
    } catch (error) {
      if (error instanceof TRPCError) throw error;

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Error fetching historical data: ${String(error)}`,
      });
    }
  }

  async searchStocks(query: string): Promise<BrapiStockQuote[]> {
    try {
      const url = new URL(`${this.BRAPI_BASE_URL}/quote/list`);
      url.searchParams.set("search", query);

      if (this.BRAPI_TOKEN) {
        url.searchParams.set("token", this.BRAPI_TOKEN);
      }

      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to search stocks",
        });
      }

      const data = (await response.json()) as BrapiResponse;

      return data.results || [];
    } catch (error) {
      if (error instanceof TRPCError) throw error;

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Error searching stocks: ${String(error)}`,
      });
    }
  }

  /**
   * Get available stocks list
   */
  async getAvailableStocks(): Promise<string[]> {
    try {
      const url = new URL(`${this.BRAPI_BASE_URL}/available`);

      if (this.BRAPI_TOKEN) {
        url.searchParams.set("token", this.BRAPI_TOKEN);
      }

      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch available stocks",
        });
      }

      const data = (await response.json()) as { stocks: string[] };

      return data.stocks || [];
    } catch (error) {
      if (error instanceof TRPCError) throw error;

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Error fetching available stocks: ${String(error)}`,
      });
    }
  }


  async getCDIData(
    startDate: string,
    endDate: string,
  ): Promise<CDIDataPoint[]> {
    const formatToBCB = (dateStr: string): string => {
      const d = new Date(dateStr);
      const day = String(d.getUTCDate()).padStart(2, "0");
      const month = String(d.getUTCMonth() + 1).padStart(2, "0");
      const year = d.getUTCFullYear();
      return `${day}/${month}/${year}`;
    };

    const url = new URL(
      "https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados",
    );
    url.searchParams.set("formato", "json");
    url.searchParams.set("dataInicial", formatToBCB(startDate));
    url.searchParams.set("dataFinal", formatToBCB(endDate));

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to fetch CDI data from BCB: ${response.status}`,
      });
    }

    interface BCBDataPoint {
      data: string;  // "DD/MM/YYYY"
      valor: string; // taxa diária em %, ex: "0.05164"
    }

    const bcbData = (await response.json()) as BCBDataPoint[];

    // Constrói mapa data → taxa diária decimal
    const dailyRateMap = new Map<string, number>(
      bcbData.map((point) => [
        // Normaliza para YYYY-MM-DD para comparação
        point.data.split("/").reverse().join("-"),
        parseFloat(point.valor) / 100,
      ]),
    );

    const start = new Date(startDate);
    const end = new Date(endDate);
    const data: CDIDataPoint[] = [];

    const currentDate = new Date(start);
    let accumulatedValue = 100;

    while (currentDate <= end) {
      const dateKey = currentDate.toISOString().split("T")[0]!;
      const dailyRate = dailyRateMap.get(dateKey) ?? 0; // fins de semana/feriados = 0

      accumulatedValue *= 1 + dailyRate;

      data.push({
        date: dateKey,
        value: accumulatedValue,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return data;
  }
}

export const marketDataService = new MarketDataService();
