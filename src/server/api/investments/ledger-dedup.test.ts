import { describe, expect, it } from "vitest";

import { incomeMovementKey, tradeMovementKey } from "./ledger-dedup";

describe("tradeMovementKey", () => {
  const trade = {
    assetName: "PETR4",
    date: "2026-01-16",
    side: "BUY" as const,
    quantity: 47,
    amount: 2078.34,
  };

  it("is equal for the same movement described by two sources", () => {
    // B3 sends integers, Pluggy sends the same numbers with float noise.
    expect(tradeMovementKey({ ...trade, quantity: 47.0 })).toBe(
      tradeMovementKey({ ...trade, amount: 2078.3400000000001 }),
    );
  });

  it("separates the sides of a day trade", () => {
    expect(tradeMovementKey({ ...trade, side: "SELL" })).not.toBe(
      tradeMovementKey(trade),
    );
  });

  it("separates movements that differ by a cent or a share", () => {
    expect(tradeMovementKey({ ...trade, amount: 2078.35 })).not.toBe(
      tradeMovementKey(trade),
    );
    expect(tradeMovementKey({ ...trade, quantity: 48 })).not.toBe(
      tradeMovementKey(trade),
    );
  });
});

describe("incomeMovementKey", () => {
  it("ignores the payment type, which the two sources disagree about", () => {
    // The B3 report calls it JCP; Pluggy reports every payout as INTEREST.
    const payment = { assetName: "ITUB4", date: "2026-09-01", amount: 0.56 };
    expect(incomeMovementKey(payment)).toBe(incomeMovementKey({ ...payment }));
    expect(incomeMovementKey(payment)).not.toBe(
      incomeMovementKey({ ...payment, amount: 0.57 }),
    );
  });
});
