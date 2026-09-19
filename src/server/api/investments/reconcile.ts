// Checks the ledger's own arithmetic against what the bank says it holds.
//
// The two numbers are built from different things: the app's value is the
// ledger's quantity priced by a market source, the bank's is whatever the
// institution reported at the last sync. They are supposed to agree, and when
// they do not, the disagreement is the point — it names something the ledger
// is missing or pricing differently. Nothing here changes the ledger; it only
// reports — and remembers which disagreements the owner has already looked at
// and chosen to keep.
import type { SnapshotHolding } from "./portfolio-engine";

/** What the provider last reported for one holding. */
export interface ProviderHoldingFact {
  assetName: string;
  quantity: number | null;
  value: number | null;
  profit: number | null;
  syncedAt: Date | null;
}

/**
 * A resolution the owner recorded for one holding, with the bank's figures as
 * they were at the time. It only holds while the bank still reports those
 * same figures — see `decisionApplies`.
 */
export interface ReconciliationDecision {
  assetName: string;
  /** "app": keep the ledger's figure. "bank_price": price the holding as the bank does. */
  decision: "app" | "bank_price";
  providerQuantity: number | null;
  providerValue: number | null;
  providerProfit: number | null;
}

/**
 * Why a holding's two figures differ. The order matters: a quantity gap
 * explains any value gap that comes with it, so it is reported first and the
 * price is only blamed when the quantity already agrees.
 */
export type ReconciliationCause =
  | "quantity" // the ledger holds fewer (or more) units than the bank reports
  | "price" // same units, different unit price — quota dates, stale quotes
  | "gain" // same position, same value, different cost basis
  | "unreported" // the bank sent no comparable figure
  | "accepted" // it differs, and the owner chose to keep the ledger's figure
  | "match";

export interface ReconciliationEntry {
  assetName: string;
  label: string | null;
  appQuantity: number;
  providerQuantity: number | null;
  appValue: number;
  providerValue: number | null;
  /** `appValue - providerValue`, null when there is nothing to compare. */
  difference: number | null;
  /** The difference as a share of the provider's figure. */
  differencePercent: number | null;
  appGain: number;
  providerGain: number | null;
  /** `appGain - providerGain`, null when the bank reported no profit figure. */
  gainDifference: number | null;
  cause: ReconciliationCause;
}

export interface Reconciliation {
  entries: ReconciliationEntry[];
  /** Entries with a disagreement still to look at, worst first. */
  mismatches: ReconciliationEntry[];
  /** Mismatches the owner chose to keep as they are, still in the totals. */
  accepted: ReconciliationEntry[];
  appTotal: number;
  providerTotal: number;
  difference: number;
  differencePercent: number;
  /** Holdings the provider reported nothing for, excluded from the totals. */
  unreported: number;
  /** Oldest sync among the compared holdings — the figures are only as fresh. */
  syncedAt: Date | null;
}

/**
 * Quantities and prices are floating point, and the bank rounds its own
 * figures before reporting them. A tenth of a percent is below anything a
 * missing trade or a stale quote could hide in.
 */
const QUANTITY_TOLERANCE = 0.001;

/**
 * Value gets a wider band than quantity: the app prices a fund on the CVM
 * quota for the last published day and the bank on its own, so a day of
 * movement is an honest difference rather than a defect. A percent of the
 * position is roughly a bad day in a volatile fund.
 */
const VALUE_TOLERANCE = 0.01;

/**
 * Tight enough that only the bank re-reporting the same position passes —
 * the figures are stored as the connector sent them, so a genuine change is
 * never this small — and loose enough to forgive a float round trip.
 */
const FINGERPRINT_TOLERANCE = 1e-6;

function sameFigure(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    Math.abs(a - b) <=
    Math.max(Math.abs(a), Math.abs(b), 1) * FINGERPRINT_TOLERANCE
  );
}

/**
 * Whether a decision still holds: it was taken against a particular set of
 * bank figures, and stands only for as long as the bank keeps reporting them.
 */
export function decisionApplies(
  decision: ReconciliationDecision,
  fact: ProviderHoldingFact | undefined,
): boolean {
  if (!fact) return false;
  return (
    sameFigure(decision.providerQuantity, fact.quantity) &&
    sameFigure(decision.providerValue, fact.value) &&
    sameFigure(decision.providerProfit, fact.profit)
  );
}

/**
 * The causes that name a disagreement: two figures for the same holding, and
 * they differ. "unreported" is not one — there is only one figure — and
 * "accepted" is one the owner has already looked at.
 */
const RESOLVABLE = new Set<ReconciliationCause>(["quantity", "price", "gain"]);

export function reconcileHoldings(
  holdings: SnapshotHolding[],
  facts: ProviderHoldingFact[],
  decisions: ReconciliationDecision[] = [],
): Reconciliation {
  const factByAsset = new Map(facts.map((fact) => [fact.assetName, fact]));
  // Only "app" decisions change what is reported; a "bank_price" one has
  // already acted upstream, in the price the holding was marked at.
  const kept = new Set(
    decisions
      .filter(
        (decision) =>
          decision.decision === "app" &&
          decisionApplies(decision, factByAsset.get(decision.assetName)),
      )
      .map((decision) => decision.assetName),
  );
  const causeFor = (
    assetName: string,
    cause: ReconciliationCause,
  ): ReconciliationCause =>
    cause !== "match" && kept.has(assetName) ? "accepted" : cause;

  let appTotal = 0;
  let providerTotal = 0;
  let unreported = 0;
  let syncedAt: Date | null = null;

  const entries: ReconciliationEntry[] = holdings.map((holding) => {
    const fact = factByAsset.get(holding.assetName);
    const providerValue = fact?.value ?? null;
    const providerQuantity = fact?.quantity ?? null;

    const providerGain = fact?.profit ?? null;
    const base: Omit<
      ReconciliationEntry,
      "difference" | "differencePercent" | "gainDifference" | "cause"
    > = {
      assetName: holding.assetName,
      label: holding.label,
      appQuantity: holding.quantity,
      providerQuantity,
      appValue: holding.currentValue,
      providerValue,
      appGain: holding.unrealizedGain,
      providerGain,
    };

    // An asset the bank never mentioned is not a mismatch — it is a holding
    // this connection does not cover (a manual entry, another broker). It stays
    // out of the totals so the comparison is like for like.
    if (providerValue === null) {
      unreported++;
      return {
        ...base,
        difference: null,
        differencePercent: null,
        gainDifference: null,
        cause: "unreported",
      };
    }

    appTotal += holding.currentValue;
    providerTotal += providerValue;
    if (fact?.syncedAt && (!syncedAt || fact.syncedAt < syncedAt)) {
      syncedAt = fact.syncedAt;
    }

    const difference = holding.currentValue - providerValue;
    const differencePercent =
      providerValue !== 0 ? difference / providerValue : 0;

    const quantityOff =
      providerQuantity !== null &&
      providerQuantity !== 0 &&
      Math.abs(holding.quantity - providerQuantity) / providerQuantity >
        QUANTITY_TOLERANCE;

    const gainDifference =
      providerGain === null ? null : holding.unrealizedGain - providerGain;
    // Measured against the position rather than against the gain itself: a gain
    // near zero would make any relative comparison meaningless, and what is
    // being asked is "how much of this position is unexplained".
    const gainOff =
      gainDifference !== null &&
      Math.abs(gainDifference) > Math.abs(providerValue) * VALUE_TOLERANCE;

    // Ordered: a quantity gap explains the value gap that comes with it, and a
    // value gap explains the gain gap. Only the first unexplained one is named.
    let cause: ReconciliationCause = "match";
    if (quantityOff) cause = "quantity";
    else if (Math.abs(differencePercent) > VALUE_TOLERANCE) cause = "price";
    else if (gainOff) cause = "gain";

    return {
      ...base,
      difference,
      differencePercent,
      gainDifference,
      cause: causeFor(holding.assetName, cause),
    };
  });

  // A holding the bank reports and the ledger does not have at all. Left out,
  // the two totals could agree while an entire asset was missing from the app
  // — the one case where a silent omission looks like a clean bill of health.
  const held = new Set(holdings.map((holding) => holding.assetName));
  for (const fact of facts) {
    if (held.has(fact.assetName)) continue;
    if (fact.value === null || fact.value <= 0) continue;

    appTotal += 0;
    providerTotal += fact.value;
    if (fact.syncedAt && (!syncedAt || fact.syncedAt < syncedAt)) {
      syncedAt = fact.syncedAt;
    }
    entries.push({
      assetName: fact.assetName,
      label: null,
      appQuantity: 0,
      providerQuantity: fact.quantity,
      appValue: 0,
      providerValue: fact.value,
      appGain: 0,
      providerGain: fact.profit,
      gainDifference: fact.profit === null ? null : -fact.profit,
      difference: -fact.value,
      differencePercent: -1,
      cause: causeFor(fact.assetName, "quantity"),
    });
  }

  const difference = appTotal - providerTotal;

  return {
    entries,
    mismatches: entries
      .filter((entry) => RESOLVABLE.has(entry.cause))
      .sort(
        (a, b) => Math.abs(b.difference ?? 0) - Math.abs(a.difference ?? 0),
      ),
    accepted: entries.filter((entry) => entry.cause === "accepted"),
    appTotal,
    providerTotal,
    difference,
    differencePercent: providerTotal !== 0 ? difference / providerTotal : 0,
    unreported,
    syncedAt,
  };
}
