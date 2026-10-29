export interface MarketDataStatus {
  needsRefresh: boolean;
  isPartial: boolean;
  oldestAvailableAsOf: string | null;
}

export function emptyMarketDataStatus(): MarketDataStatus {
  return { needsRefresh: false, isPartial: false, oldestAvailableAsOf: null };
}
