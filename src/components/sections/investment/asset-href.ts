/**
 * Asset names are uppercased tickers for market assets but free-form for fixed
 * income (RenameAssetDialog allows spaces and accents), so they must be encoded
 * to survive a URL segment. Centralised so the link and the page that reads the
 * param can't disagree on the encoding.
 */
export function assetDetailHref(assetName: string): string {
  return `/dashboard/investments/${encodeURIComponent(assetName)}`;
}
