import { describe, expect, it } from "vitest";

import type { PluggyInvestment } from "~/server/services/pluggy";
import { investment, movement } from "~/test/pluggy";
import {
  holdingShortfall,
  normalizeInvestmentMovements,
  normalizeShortfallPosition,
  normalizeOpeningPosition,
  pluggyInvestmentSourceHash,
} from "./investment-import";

describe("normalizeInvestmentMovements", () => {
  it("maps a buy onto a trade row", () => {
    const { rows } = normalizeInvestmentMovements(investment(), [movement()]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "trade",
      assetName: "PETR4",
      side: "BUY",
      quantity: 10,
      price: 38.5,
      amount: 385,
      // The trade date is what the ledger records, not the settlement date.
      date: "2026-03-13",
      providerType: "EQUITY",
      providerSubtype: "STOCK",
      isFixedIncome: false,
    });
  });

  it("falls back to the holding name when there is no ticker", () => {
    const { rows } = normalizeInvestmentMovements(
      investment({ code: "  ", name: "  CDB BANCO X  " }),
      [movement()],
    );
    expect(rows[0]?.assetName).toBe("CDB BANCO X");
  });

  it("maps interest onto an income row", () => {
    const { rows } = normalizeInvestmentMovements(investment(), [
      movement({ type: "INTEREST", amount: 12.5 }),
    ]);
    expect(rows[0]).toMatchObject({ kind: "income", amount: 12.5 });
  });

  it("reports movements it cannot represent instead of dropping them silently", () => {
    const { rows, unsupported } = normalizeInvestmentMovements(investment(), [
      movement({ id: "a", type: "TAX" }),
      movement({ id: "b", type: "TRANSFER" }),
      movement({ id: "c", type: "AMORTIZATION" }),
    ]);

    expect(rows).toHaveLength(0);
    expect(unsupported.map((entry) => entry.movementType)).toEqual([
      "TAX",
      "TRANSFER",
      "AMORTIZATION",
    ]);
  });

  it("derives the quantity from the unit value when the provider omits it", () => {
    // Fund applications commonly arrive as an amount and a quota value with no
    // share count. Dropping them leaves the holding smaller than the position
    // the bank actually reports, so the quantity is computed from the two
    // numbers the provider did send.
    const { rows, dropped } = normalizeInvestmentMovements(investment(), [
      movement({ quantity: 0, value: 2.5, amount: 1000 }),
    ]);
    expect(rows[0]).toMatchObject({ quantity: 400, price: 2.5 });
    expect(dropped.withoutQuantity).toBe(0);
  });

  it("drops a trade with neither quantity nor unit value, and counts it", () => {
    // Nothing to compute from: a fabricated quantity would corrupt the average
    // cost of the whole position. It is reported rather than dropped silently.
    const { rows, unsupported, dropped } = normalizeInvestmentMovements(
      investment(),
      [movement({ quantity: 0, value: 0 })],
    );
    expect(rows).toHaveLength(0);
    expect(unsupported).toHaveLength(0);
    expect(dropped.withoutQuantity).toBe(1);
  });

  it("accounts for every movement the provider sent", () => {
    // The law that makes a silently vanished movement impossible to ship: each
    // one is a row, an unsupported entry, or a counted drop — never nothing.
    // The missing-quantity bug got through precisely because a `continue` here
    // left no trace anywhere.
    const movements = [
      movement({ id: "a", type: "BUY" }),
      movement({ id: "b", type: "SELL" }),
      movement({ id: "c", type: "INTEREST" }),
      movement({ id: "d", type: "TAX" }),
      movement({ id: "e", type: "TRANSFER" }),
      movement({ id: "f", type: "AMORTIZATION" }),
      movement({ id: "g", quantity: 0, value: 0 }), // nothing to derive from
      movement({ id: "h", amount: 0 }), // no money
      movement({ id: "i", date: "", tradeDate: "" }), // no date
      movement({ id: "j", quantity: 0, value: 2.5, amount: 1000 }), // derivable
    ];

    const { rows, unsupported, dropped } = normalizeInvestmentMovements(
      investment(),
      movements,
    );

    expect(
      rows.length +
        unsupported.length +
        dropped.withoutQuantity +
        dropped.unusable,
    ).toBe(movements.length);
    expect(rows).toHaveLength(4); // 2 trades, 1 income, 1 derived trade
    expect(unsupported).toHaveLength(3);
    expect(dropped).toEqual({ withoutQuantity: 1, unusable: 2 });
  });

  it("drops movements with no usable date or amount, and counts them", () => {
    const { rows, dropped } = normalizeInvestmentMovements(investment(), [
      movement({ id: "a", date: "", tradeDate: "" }),
      movement({ id: "b", amount: 0 }),
      movement({ id: "c", amount: -10 }),
    ]);
    expect(rows).toHaveLength(0);
    expect(dropped.unusable).toBe(3);
  });

  it("derives the unit price when the provider omits it", () => {
    const { rows } = normalizeInvestmentMovements(investment(), [
      movement({
        value: undefined as unknown as number,
        amount: 400,
        quantity: 10,
      }),
    ]);
    expect(rows[0]).toMatchObject({ price: 40 });
  });

  describe("fixed income", () => {
    it("carries a CDI-linked rate through", () => {
      const { rows } = normalizeInvestmentMovements(
        investment({
          type: "FIXED_INCOME",
          subtype: "CDB",
          rateType: "CDI",
          rate: 110,
          dueDate: "2028-05-02T00:00:00.000Z",
        }),
        [movement()],
      );

      expect(rows[0]).toMatchObject({
        isFixedIncome: true,
        fixedIncomeYieldType: "CDI_PERCENTAGE",
        fixedIncomeRate: 110,
        fixedIncomeMaturityDate: "2028-05-02",
      });
    });

    it("treats a fixed annual rate as prefixed", () => {
      const { rows } = normalizeInvestmentMovements(
        investment({
          type: "FIXED_INCOME",
          subtype: "CDB",
          rateType: null,
          fixedAnnualRate: 12.5,
        }),
        [movement()],
      );

      expect(rows[0]).toMatchObject({
        fixedIncomeYieldType: "PREFIXED",
        fixedIncomeRate: 12.5,
      });
    });

    it("leaves the yield unset when the connector sent no rate", () => {
      const { rows } = normalizeInvestmentMovements(
        investment({ type: "FIXED_INCOME", subtype: "CDB" }),
        [movement()],
      );
      expect(rows[0]).toMatchObject({
        isFixedIncome: true,
        fixedIncomeYieldType: null,
        fixedIncomeRate: null,
      });
    });
  });
});

describe("asset names", () => {
  it("keys a fund by its CNPJ and carries the readable name as a label", () => {
    // Pluggy reports a fund's `code` as its CNPJ. The code stays the key —
    // it is unique and it is what the CVM price series is keyed by — so the
    // name has to travel separately for the UI to have anything to print.
    const { rows } = normalizeInvestmentMovements(
      investment({
        name: "ACE Capital Advisory FIF CIC Multi RL",
        code: "28.947.266/0001-65",
        type: "MUTUAL_FUND",
        subtype: "MULTIMARKET",
      }),
      [movement()],
    );

    expect(rows[0]).toMatchObject({
      assetName: "28.947.266/0001-65",
      assetLabel: "ACE Capital Advisory FIF CIC Multi RL",
      fundCnpj: "28947266000165",
    });
  });

  it("labels a fixed-income holding whose key is an issuer code", () => {
    const { rows } = normalizeInvestmentMovements(
      investment({
        name: "CDB - BANCO AFINZ S.A. BANCO MULTIPLO",
        code: "CDBA251SW5G",
        type: "FIXED_INCOME",
        subtype: "CDB",
      }),
      [movement()],
    );

    expect(rows[0]).toMatchObject({
      assetName: "CDBA251SW5G",
      assetLabel: "CDB - BANCO AFINZ S.A. BANCO MULTIPLO",
      // Only funds are priced by CNPJ; a CDB accrues at its own rate.
      fundCnpj: null,
    });
  });

  it("leaves the label empty when the name only repeats the ticker", () => {
    const { rows } = normalizeInvestmentMovements(
      investment({ name: "PETR4", code: "PETR4" }),
      [movement()],
    );

    expect(rows[0]).toMatchObject({ assetName: "PETR4", assetLabel: null });
  });

  it("carries the same label onto an opening position", () => {
    const position = normalizeOpeningPosition(
      investment({
        name: "Kinea Atlas II FIM RL",
        code: "34.774.642/0001-60",
        type: "MUTUAL_FUND",
        issueDate: "2026-01-05",
        amountOriginal: 1000,
        quantity: 500,
      }),
    );

    expect(position).toMatchObject({
      assetName: "34.774.642/0001-60",
      assetLabel: "Kinea Atlas II FIM RL",
      fundCnpj: "34774642000160",
    });
  });
});

describe("pluggyInvestmentSourceHash", () => {
  it("is stable across syncs for the same movement", () => {
    const [row] = normalizeInvestmentMovements(investment(), [movement()]).rows;
    const [again] = normalizeInvestmentMovements(investment(), [
      movement(),
    ]).rows;
    expect(pluggyInvestmentSourceHash(row!)).toBe(
      pluggyInvestmentSourceHash(again!),
    );
  });

  it("stays stable for connectors that send no movement id", () => {
    // The deterministic fallback is what keeps a re-sync from double
    // importing every movement of such a connector.
    const withoutId = movement({ id: null });
    const [first] = normalizeInvestmentMovements(investment(), [
      withoutId,
    ]).rows;
    const [second] = normalizeInvestmentMovements(investment(), [
      movement({ id: null }),
    ]).rows;

    expect(pluggyInvestmentSourceHash(first!)).toBe(
      pluggyInvestmentSourceHash(second!),
    );
  });

  it("separates two distinct id-less movements of the same holding", () => {
    const { rows } = normalizeInvestmentMovements(investment(), [
      movement({ id: null, amount: 385, quantity: 10 }),
      movement({ id: null, amount: 770, quantity: 20 }),
    ]);

    expect(pluggyInvestmentSourceHash(rows[0]!)).not.toBe(
      pluggyInvestmentSourceHash(rows[1]!),
    );
  });

  it("scopes the hash by holding, so two holdings cannot collide", () => {
    const [a] = normalizeInvestmentMovements(investment({ id: "inv-1" }), [
      movement({ id: null }),
    ]).rows;
    const [b] = normalizeInvestmentMovements(investment({ id: "inv-2" }), [
      movement({ id: null }),
    ]).rows;
    expect(pluggyInvestmentSourceHash(a!)).not.toBe(
      pluggyInvestmentSourceHash(b!),
    );
  });
});

describe("holdingShortfall", () => {
  it("reports the part of a holding its movements cannot explain", () => {
    // The real shape of the bug: a fund bought before the connector's history
    // window returns only its recent movements, and the position built from
    // them is a fraction of what the bank holds.
    const held = investment({ quantity: 836.78, value: 1.99 });
    const { rows } = normalizeInvestmentMovements(held, [
      movement({ id: "a", quantity: 8.02, value: 1.88, amount: 15.08 }),
      movement({ id: "b", quantity: 4.22, value: 1.94, amount: 8.18 }),
    ]);

    const shortfall = holdingShortfall(held, rows);
    expect(shortfall?.reported).toBe(836.78);
    expect(shortfall?.covered).toBeCloseTo(12.24, 2);
    expect(shortfall?.missing).toBeCloseTo(824.54, 2);
  });

  it("says nothing when the movements add up to the reported position", () => {
    const held = investment({ quantity: 10 });
    const { rows } = normalizeInvestmentMovements(held, [movement()]);
    expect(holdingShortfall(held, rows)).toBeNull();
  });

  it("counts a sale against the covered quantity", () => {
    const held = investment({ quantity: 4 });
    const { rows } = normalizeInvestmentMovements(held, [
      movement({ id: "a", type: "BUY", quantity: 10 }),
      movement({ id: "b", type: "SELL", quantity: 6 }),
    ]);
    expect(holdingShortfall(held, rows)).toBeNull();
  });

  it("ignores rounding-scale disagreement", () => {
    const held = investment({ quantity: 10.0001 });
    const { rows } = normalizeInvestmentMovements(held, [movement()]);
    expect(holdingShortfall(held, rows)).toBeNull();
  });

  it("has nothing to compare against when the provider reports no quantity", () => {
    const held = investment({ quantity: null });
    const { rows } = normalizeInvestmentMovements(held, [movement()]);
    expect(holdingShortfall(held, rows)).toBeNull();
  });
});

describe("normalizeShortfallPosition", () => {
  function shortfallCase(overrides: Partial<PluggyInvestment> = {}) {
    const held = investment({
      quantity: 836.78,
      value: 1.99,
      amountOriginal: 1200,
      issueDate: null,
      ...overrides,
    });
    const { rows } = normalizeInvestmentMovements(held, [
      movement({ id: "a", quantity: 8.02, value: 1.88, amount: 15.08 }),
      movement({ id: "b", quantity: 4.22, value: 1.94, amount: 8.18 }),
    ]);
    const shortfall = holdingShortfall(held, rows)!;
    return { held, rows, shortfall };
  }

  it("reconstructs the pre-window quotas from what the provider says was applied", () => {
    const { held, rows, shortfall } = shortfallCase();

    const position = normalizeShortfallPosition(held, shortfall, rows);

    // 1200 applied in total, 23.26 of it explained by the window's own buys.
    expect(position).toMatchObject({ kind: "position", amount: 1176.74 });
    expect(position?.kind === "position" && position.quantity).toBeCloseTo(
      824.54,
      2,
    );
  });

  it("dates it to the day before the window, when there is no acquisition date", () => {
    const { held, rows, shortfall } = shortfallCase();
    // The earliest movement is the 13th (tradeDate), so the quotas that
    // predate the window were held on the 12th at the latest.
    expect(normalizeShortfallPosition(held, shortfall, rows)?.date).toBe(
      "2026-03-12",
    );
  });

  it("prefers the acquisition date the provider reports", () => {
    const { held, rows, shortfall } = shortfallCase({
      issueDate: "2024-07-01",
    });
    expect(normalizeShortfallPosition(held, shortfall, rows)?.date).toBe(
      "2024-07-01",
    );
  });

  it("refuses when the provider reports no amount applied", () => {
    const { held, rows, shortfall } = shortfallCase({ amountOriginal: null });
    expect(normalizeShortfallPosition(held, shortfall, rows)).toBeNull();
  });

  it("refuses when the window's own buys already account for everything applied", () => {
    // Nothing honest is left to price the missing quotas with: inventing a
    // cost here would be the balance-as-cost-basis mistake in another guise.
    const { held, rows, shortfall } = shortfallCase({ amountOriginal: 20 });
    expect(normalizeShortfallPosition(held, shortfall, rows)).toBeNull();
  });

  it("hashes apart from an opening position, so both can coexist", () => {
    const { held, rows, shortfall } = shortfallCase();
    const position = normalizeShortfallPosition(held, shortfall, rows)!;
    expect(pluggyInvestmentSourceHash(position)).toBe(
      "pluggy:position:inv-1:shortfall",
    );
  });
});

describe("normalizeOpeningPosition", () => {
  it("maps a holding with a real cost basis onto one opening buy", () => {
    const row = normalizeOpeningPosition(
      investment({
        issueDate: "2024-02-01T00:00:00.000Z",
        amountOriginal: 1000,
        quantity: 50,
        amount: 1450,
        balance: 1450,
      }),
    );

    expect(row).toMatchObject({
      kind: "position",
      assetName: "PETR4",
      date: "2024-02-01",
      quantity: 50,
      amount: 1000,
      price: 20,
    });
  });

  it("falls back to the holding's own date when there is no issue date", () => {
    const row = normalizeOpeningPosition(
      investment({ date: "2025-06-10", amountOriginal: 500, quantity: 10 }),
    );
    expect(row).toMatchObject({ date: "2025-06-10" });
  });

  // The whole point of the feature's guard rail: today's balance is not a cost
  // basis, and using it would erase every gain since acquisition.
  it("refuses to invent a cost basis", () => {
    expect(
      normalizeOpeningPosition(
        investment({ amountOriginal: null, amount: 3850, balance: 3850 }),
      ),
    ).toBe(null);
    expect(
      normalizeOpeningPosition(investment({ amountOriginal: 0, quantity: 10 })),
    ).toBe(null);
  });

  it("refuses a holding with no acquisition date or no quantity", () => {
    expect(
      normalizeOpeningPosition(
        investment({ issueDate: null, date: null, amountOriginal: 900 }),
      ),
    ).toBe(null);
    expect(
      normalizeOpeningPosition(
        investment({ amountOriginal: 900, quantity: null }),
      ),
    ).toBe(null);
  });

  it("carries fixed-income terms through", () => {
    const row = normalizeOpeningPosition(
      investment({
        type: "FIXED_INCOME",
        subtype: "CDB",
        rateType: "CDI",
        rate: 102,
        dueDate: "2027-01-15",
        issueDate: "2025-01-15",
        amountOriginal: 5000,
        quantity: 1,
      }),
    );

    expect(row).toMatchObject({
      isFixedIncome: true,
      fixedIncomeYieldType: "CDI_PERCENTAGE",
      fixedIncomeRate: 102,
      fixedIncomeMaturityDate: "2027-01-15",
    });
  });

  it("hashes into its own namespace, once per holding", () => {
    // Recognisable in the ledger, and stable so a re-sync imports nothing new.
    const row = normalizeOpeningPosition(
      investment({
        issueDate: "2024-02-01",
        amountOriginal: 1000,
        quantity: 50,
      }),
    )!;
    expect(pluggyInvestmentSourceHash(row)).toBe("pluggy:position:inv-1");
  });
});
