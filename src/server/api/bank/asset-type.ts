// Pure mapping from Pluggy's investment taxonomy to the asset-type names this
// app uses. Types only, no runtime imports — the same shape as
// map-transaction.ts, and for the same reason: this is the piece a reviewer
// has to be able to read on its own.
//
// Pluggy classifies a holding twice: a coarse `type` (EQUITY, FIXED_INCOME…)
// and a finer `subtype` (STOCK, REAL_ESTATE_FUND, TREASURY…). The subtype is
// what carries the distinction a Brazilian portfolio actually cares about —
// EQUITY alone cannot tell an ação from a FII — so it decides whenever the
// connector sent one.
import type { PluggyInvestment } from "~/server/services/pluggy";

/**
 * Subtype → label. Deliberately coarse: these names have to line up with the
 * handful of types a user already keeps by hand ("Ações", "FII's", "Renda
 * Fixa"), not mirror Pluggy's full taxonomy. Splitting CDB from LCI here would
 * only produce types nobody asked for.
 */
const SUBTYPE_LABELS: Record<string, string> = {
  STOCK: "Ações",
  BDR: "BDRs",
  ETF: "ETFs",
  EXCHANGE_TRADED_FUND: "ETFs",
  ETF_FUND: "ETFs",
  REAL_ESTATE_FUND: "FIIs",
  RETIREMENT: "Previdência",
  PENSION_FUND: "Previdência",
  DERIVATIVES: "Derivativos",
  OPTION: "Derivativos",
  TREASURY: "Tesouro Direto",
  CDB: "Renda Fixa",
  LCI: "Renda Fixa",
  LCA: "Renda Fixa",
  LC: "Renda Fixa",
  LF: "Renda Fixa",
  CRI: "Renda Fixa",
  CRA: "Renda Fixa",
  DEBENTURES: "Renda Fixa",
  FIXED_INCOME: "Renda Fixa",
  INVESTMENT_FUND: "Fundos",
  MULTIMARKET_FUND: "Fundos",
  FIXED_INCOME_FUND: "Fundos",
  STOCK_FUND: "Fundos",
  OFFSHORE_FUND: "Fundos",
  FIP_FUND: "Fundos",
  MUTUAL_FUND: "Fundos",
};

/** Fallback when the connector sent no subtype, or an unknown one. */
const TYPE_LABELS: Record<string, string> = {
  EQUITY: "Ações",
  ETF: "ETFs",
  FIXED_INCOME: "Renda Fixa",
  MUTUAL_FUND: "Fundos",
  SECURITY: "Renda Fixa",
  COE: "COE",
  OTHER: "Outros",
};

/**
 * The asset-type name Pluggy's classification implies, or null when it implies
 * nothing useful. Null (rather than "Outros") on an unrecognised pair on
 * purpose: a wrong type is worse than no suggestion, because the import writes
 * it into the ledger and the allocation chart reads it back as fact.
 */
export function pluggyAssetTypeLabel(
  type: string | null | undefined,
  subtype: string | null | undefined,
): string | null {
  const key = subtype?.trim().toUpperCase();
  if (key && SUBTYPE_LABELS[key]) return SUBTYPE_LABELS[key];

  const typeKey = type?.trim().toUpperCase();
  if (!typeKey) return null;
  const label = TYPE_LABELS[typeKey];
  // "Outros" is Pluggy saying it does not know either — pass that through as
  // "no suggestion" so the user is asked instead of being handed a junk type.
  return !label || label === "Outros" ? null : label;
}

/** Same label, straight from a holding. */
export function investmentAssetTypeLabel(
  investment: Pick<PluggyInvestment, "type" | "subtype">,
): string | null {
  return pluggyAssetTypeLabel(investment.type, investment.subtype);
}

/**
 * Accent- and punctuation-insensitive key for comparing type names, so the
 * suggested "FIIs" finds a type the user typed as "FII's" instead of creating
 * a near-duplicate beside it.
 */
export function assetTypeKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
