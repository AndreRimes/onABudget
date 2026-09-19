import { describe, expect, it } from "vitest";

import type { SnapshotHolding } from "./portfolio-engine";
import {
  decisionApplies,
  reconcileHoldings,
  type ProviderHoldingFact,
  type ReconciliationDecision,
} from "./reconcile";

function holding(overrides: Partial<SnapshotHolding> = {}): SnapshotHolding {
  return {
    assetName: "PETR3",
    label: null,
    assetTypeId: 1,
    assetTypeName: "Ações",
    quantity: 14,
    averageCost: 30,
    currentPrice: 40,
    priceStatus: "ok",
    priceAsOf: null,
    currentValue: 560,
    totalCost: 420,
    unrealizedGain: 140,
    unrealizedGainPercent: 0.33,
    periodGain: 140,
    periodGainPercent: 0.33,
    dividendsTotal: 0,
    dividends12m: 0,
    isFixedIncome: false,
    fixedIncomeYieldType: null,
    fixedIncomeRate: null,
    fixedIncomeMaturityDate: null,
    tesouroTitle: null,
    fundCnpj: null,
    ...overrides,
  };
}

function fact(
  overrides: Partial<ProviderHoldingFact> = {},
): ProviderHoldingFact {
  return {
    assetName: "PETR3",
    quantity: 14,
    value: 560,
    profit: 140,
    syncedAt: new Date("2026-09-13T12:00:00Z"),
    ...overrides,
  };
}

describe("reconcileHoldings", () => {
  it("agrees when both sides hold the same units at the same value", () => {
    const result = reconcileHoldings([holding()], [fact()]);

    expect(result.mismatches).toHaveLength(0);
    expect(result.difference).toBe(0);
    expect(result.entries[0]?.cause).toBe("match");
  });

  it("blames the quantity when the ledger is short of the reported position", () => {
    // The real case: the connector's history window starts after the purchase,
    // so the ledger knows 6 of the 14 shares the bank reports.
    const result = reconcileHoldings(
      [holding({ quantity: 6, currentValue: 240 })],
      [fact()],
    );

    expect(result.mismatches[0]).toMatchObject({
      cause: "quantity",
      appQuantity: 6,
      providerQuantity: 14,
      difference: -320,
    });
  });

  it("blames the price when the units agree but the value does not", () => {
    // Same 14 shares, valued on different days — the ledger prices a fund on
    // the last published CVM quota, the bank on its own.
    const result = reconcileHoldings(
      [holding({ currentValue: 600 })],
      [fact()],
    );

    expect(result.mismatches[0]?.cause).toBe("price");
    expect(result.mismatches[0]?.differencePercent).toBeCloseTo(0.0714, 4);
  });

  it("tolerates rounding rather than reporting it as a break", () => {
    const result = reconcileHoldings(
      [holding({ quantity: 14.000001, currentValue: 560.4 })],
      [fact()],
    );
    expect(result.mismatches).toHaveLength(0);
  });

  it("reports a gain that disagrees even when position and value match", () => {
    // Same 14 shares worth the same R$560, but the bank says the position made
    // R$40 and the ledger says R$140 — the purchase prices on record are not
    // the ones the bank has, so every rentabilidade figure derived from them is
    // wrong even though the totals look fine.
    const result = reconcileHoldings([holding()], [fact({ profit: 40 })]);

    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0]).toMatchObject({
      cause: "gain",
      appGain: 140,
      providerGain: 40,
      gainDifference: 100,
      difference: 0,
    });
  });

  it("does not blame the gain when the quantity already explains it", () => {
    // A gain computed from half a position is meaningless; naming it would
    // bury the finding that actually matters.
    const result = reconcileHoldings(
      [holding({ quantity: 6, currentValue: 240, unrealizedGain: 60 })],
      [fact()],
    );

    expect(result.mismatches[0]?.cause).toBe("quantity");
  });

  it("says nothing about the gain when the bank reported none", () => {
    const result = reconcileHoldings([holding()], [fact({ profit: null })]);

    expect(result.mismatches).toHaveLength(0);
    expect(result.entries[0]).toMatchObject({
      providerGain: null,
      gainDifference: null,
    });
  });

  it("tolerates a rounding-scale gain difference", () => {
    const result = reconcileHoldings([holding()], [fact({ profit: 139.5 })]);
    expect(result.mismatches).toHaveLength(0);
  });

  it("leaves a holding the bank never reported out of the totals", () => {
    // A manual entry, or an asset held at another broker: not a mismatch, and
    // counting it would make the two totals incomparable by construction.
    const result = reconcileHoldings(
      [holding(), holding({ assetName: "WEGE3", currentValue: 1000 })],
      [fact()],
    );

    expect(result.unreported).toBe(1);
    expect(result.mismatches).toHaveLength(0);
    expect(result.appTotal).toBe(560);
    expect(result.providerTotal).toBe(560);
    expect(
      result.entries.find((entry) => entry.assetName === "WEGE3")?.cause,
    ).toBe("unreported");
  });

  it("ranks the mismatches by how much money is at stake", () => {
    const result = reconcileHoldings(
      [
        holding({ assetName: "A", quantity: 1, currentValue: 10 }),
        holding({ assetName: "B", quantity: 1, currentValue: 10 }),
      ],
      [
        fact({ assetName: "A", quantity: 2, value: 20 }),
        fact({ assetName: "B", quantity: 100, value: 1000 }),
      ],
    );

    expect(result.mismatches.map((entry) => entry.assetName)).toEqual([
      "B",
      "A",
    ]);
  });

  it("reports an asset the bank holds and the ledger does not have at all", () => {
    // Without this the totals could agree while a whole position was missing
    // from the app — the failure that looks most like success.
    const result = reconcileHoldings(
      [holding()],
      [fact(), fact({ assetName: "HGLG11", quantity: 30, value: 4500 })],
    );

    expect(result.providerTotal).toBe(5060);
    expect(result.appTotal).toBe(560);
    expect(result.mismatches[0]).toMatchObject({
      assetName: "HGLG11",
      appQuantity: 0,
      providerQuantity: 30,
      difference: -4500,
      cause: "quantity",
    });
  });

  it("reports the oldest sync among the compared holdings", () => {
    // The comparison is only as current as the least recent figure in it.
    const older = new Date("2026-09-01T00:00:00Z");
    const result = reconcileHoldings(
      [holding(), holding({ assetName: "B" })],
      [fact(), fact({ assetName: "B", syncedAt: older })],
    );
    expect(result.syncedAt).toEqual(older);
  });

  describe("decisions", () => {
    const short = () => holding({ quantity: 6, currentValue: 240 });
    const keep = (
      overrides: Partial<ReconciliationDecision> = {},
    ): ReconciliationDecision => ({
      assetName: "PETR3",
      decision: "app",
      providerQuantity: 14,
      providerValue: 560,
      providerProfit: 140,
      ...overrides,
    });

    it("reports a kept mismatch as accepted, outside the list of mismatches", () => {
      const result = reconcileHoldings([short()], [fact()], [keep()]);

      expect(result.entries[0]?.cause).toBe("accepted");
      expect(result.mismatches).toHaveLength(0);
      expect(result.accepted.map((entry) => entry.assetName)).toEqual([
        "PETR3",
      ]);
      // The figures are unchanged: accepting is about attention, not totals.
      expect(result.appTotal).toBe(240);
      expect(result.providerTotal).toBe(560);
    });

    it("lets a decision lapse when the bank reports different figures", () => {
      const result = reconcileHoldings(
        [short()],
        [fact({ quantity: 15, value: 600 })],
        [keep()],
      );

      expect(result.entries[0]?.cause).toBe("quantity");
      expect(result.accepted).toHaveLength(0);
    });

    it("never turns a match into an accepted one", () => {
      const result = reconcileHoldings([holding()], [fact()], [keep()]);
      expect(result.entries[0]?.cause).toBe("match");
      expect(result.accepted).toHaveLength(0);
    });

    it("keeps an asset the ledger does not have at all", () => {
      const result = reconcileHoldings(
        [holding()],
        [fact(), fact({ assetName: "HGLG11", quantity: 30, value: 4500 })],
        [
          keep({
            assetName: "HGLG11",
            providerQuantity: 30,
            providerValue: 4500,
            providerProfit: 140,
          }),
        ],
      );

      expect(result.mismatches).toHaveLength(0);
      expect(result.accepted[0]).toMatchObject({
        assetName: "HGLG11",
        cause: "accepted",
      });
    });

    it("leaves a bank-price decision to the pricing step", () => {
      // It has already acted, upstream, in the price the holding carries; here
      // it must not hide whatever is still different.
      const result = reconcileHoldings(
        [short()],
        [fact()],
        [keep({ decision: "bank_price" })],
      );
      expect(result.entries[0]?.cause).toBe("quantity");
    });

    it("matches figures within a float round trip, and null only with null", () => {
      expect(decisionApplies(keep(), fact({ value: 560.0000001 }))).toBe(true);
      expect(decisionApplies(keep(), fact({ value: 560.01 }))).toBe(false);
      expect(decisionApplies(keep(), fact({ profit: null }))).toBe(false);
      expect(
        decisionApplies(keep({ providerProfit: null }), fact({ profit: null })),
      ).toBe(true);
      expect(decisionApplies(keep(), undefined)).toBe(false);
    });
  });
});
