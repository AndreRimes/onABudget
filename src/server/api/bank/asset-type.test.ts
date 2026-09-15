import { describe, expect, it } from "vitest";

import { assetTypeKey, pluggyAssetTypeLabel } from "./asset-type";

describe("pluggyAssetTypeLabel", () => {
  it("lets the subtype decide when there is one", () => {
    // The whole reason subtype wins: EQUITY alone cannot separate an ação from
    // a FII, and both arrive under that same type.
    expect(pluggyAssetTypeLabel("EQUITY", "STOCK")).toBe("Ações");
    expect(pluggyAssetTypeLabel("EQUITY", "REAL_ESTATE_FUND")).toBe("FIIs");
    expect(pluggyAssetTypeLabel("EQUITY", "ETF")).toBe("ETFs");
    expect(pluggyAssetTypeLabel("EQUITY", "BDR")).toBe("BDRs");
  });

  it("separates Tesouro Direto from the rest of fixed income", () => {
    expect(pluggyAssetTypeLabel("FIXED_INCOME", "TREASURY")).toBe(
      "Tesouro Direto",
    );
    expect(pluggyAssetTypeLabel("FIXED_INCOME", "CDB")).toBe("Renda Fixa");
    expect(pluggyAssetTypeLabel("FIXED_INCOME", "LCI")).toBe("Renda Fixa");
    expect(pluggyAssetTypeLabel("FIXED_INCOME", "DEBENTURES")).toBe(
      "Renda Fixa",
    );
  });

  it("falls back to the type when the subtype is missing or unknown", () => {
    expect(pluggyAssetTypeLabel("FIXED_INCOME", null)).toBe("Renda Fixa");
    expect(pluggyAssetTypeLabel("MUTUAL_FUND", undefined)).toBe("Fundos");
    expect(pluggyAssetTypeLabel("EQUITY", "SOMETHING_NEW")).toBe("Ações");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(pluggyAssetTypeLabel("equity", " stock ")).toBe("Ações");
  });

  // A wrong type is worse than no suggestion: the import writes it into the
  // ledger and the allocation chart reads it back as fact.
  it("suggests nothing when the classification says nothing", () => {
    expect(pluggyAssetTypeLabel("OTHER", null)).toBe(null);
    expect(pluggyAssetTypeLabel("OTHER", "OTHER")).toBe(null);
    expect(pluggyAssetTypeLabel("SOMETHING_NEW", null)).toBe(null);
    expect(pluggyAssetTypeLabel(null, null)).toBe(null);
    expect(pluggyAssetTypeLabel("", "")).toBe(null);
  });

  it("still resolves an unknown type through a known subtype", () => {
    expect(pluggyAssetTypeLabel("SOMETHING_NEW", "STOCK")).toBe("Ações");
  });
});

describe("assetTypeKey", () => {
  it("matches names that differ only by accent, case or punctuation", () => {
    // The real pairing this exists for: a suggested "FIIs" must land on a
    // hand-typed "FII's" instead of creating a near-duplicate beside it.
    expect(assetTypeKey("FIIs")).toBe(assetTypeKey("FII's"));
    expect(assetTypeKey("Ações")).toBe(assetTypeKey("Acoes"));
    expect(assetTypeKey("Renda Fixa")).toBe(assetTypeKey("renda  fixa"));
    expect(assetTypeKey("Tesouro Direto")).toBe(assetTypeKey("TESOURO-DIRETO"));
  });

  it("keeps genuinely different names apart", () => {
    expect(assetTypeKey("Renda Fixa")).not.toBe(
      assetTypeKey("Renda Fixa Dinamica"),
    );
    expect(assetTypeKey("ETFs")).not.toBe(assetTypeKey("FIIs"));
  });
});
