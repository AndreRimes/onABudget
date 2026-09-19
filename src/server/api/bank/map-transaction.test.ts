import { describe, expect, it } from "vitest";

import type { PluggyTransaction } from "~/server/services/pluggy";
import { toStatementRow } from "./map-transaction";

function transaction(
  overrides: Partial<PluggyTransaction> = {},
): PluggyTransaction {
  return {
    id: "tx-1",
    accountId: "acc-1",
    date: "2026-03-14T00:00:00.000Z",
    description: "PADARIA CENTRAL",
    descriptionRaw: null,
    amount: 25.4,
    currencyCode: "BRL",
    type: "DEBIT",
    status: "POSTED",
    ...overrides,
  };
}

describe("toStatementRow", () => {
  // The sign rule is the one part of this integration that fails silently:
  // getting it backwards books every card purchase as income, and no error is
  // ever raised. Both directions of both account kinds are pinned here.
  describe("sign rule", () => {
    it("follows `type` on a BANK account", () => {
      expect(toStatementRow(transaction({ type: "DEBIT" }), "BANK")?.kind).toBe(
        "debit",
      );
      expect(
        toStatementRow(transaction({ type: "CREDIT" }), "BANK")?.kind,
      ).toBe("credit");
    });

    it("follows the sign of `amount` on a CREDIT account, ignoring `type`", () => {
      // A card purchase: positive amount (adds to the bill) — and Pluggy may
      // still label it CREDIT, which must not win.
      expect(
        toStatementRow(transaction({ amount: 120, type: "CREDIT" }), "CREDIT")
          ?.kind,
      ).toBe("debit");

      // Paying the bill: negative amount.
      expect(
        toStatementRow(transaction({ amount: -120, type: "DEBIT" }), "CREDIT")
          ?.kind,
      ).toBe("credit");
    });

    it("always reports a positive amount", () => {
      expect(
        toStatementRow(transaction({ amount: -120 }), "CREDIT")?.amount,
      ).toBe(120);
      expect(
        toStatementRow(transaction({ amount: 120 }), "CREDIT")?.amount,
      ).toBe(120);
    });
  });

  describe("rows that must not be imported", () => {
    it("skips PENDING transactions", () => {
      // A pending id changes when it posts, so importing now would defeat the
      // dedup hash and land the charge twice.
      expect(toStatementRow(transaction({ status: "PENDING" }), "BANK")).toBe(
        null,
      );
    });

    it("skips zero-amount transactions", () => {
      expect(toStatementRow(transaction({ amount: 0 }), "BANK")).toBeNull();
    });

    it("keeps transactions with an unknown status", () => {
      expect(toStatementRow(transaction({ status: null }), "BANK")).not.toBe(
        null,
      );
    });
  });

  describe("description", () => {
    it("prefers the friendly description", () => {
      const row = toStatementRow(
        transaction({ description: "PADARIA", descriptionRaw: "PAD*123" }),
        "BANK",
      );
      expect(row?.description).toBe("PADARIA");
    });

    it("falls back to the raw description when the friendly one is empty", () => {
      // "first non-empty", not "first non-nullish": a connector that sends ""
      // has to fall through too.
      const row = toStatementRow(
        transaction({ description: "   ", descriptionRaw: "PAD*123" }),
        "BANK",
      );
      expect(row?.description).toBe("PAD*123");
    });

    it("ends up empty when neither is usable", () => {
      const row = toStatementRow(
        transaction({ description: "", descriptionRaw: null }),
        "BANK",
      );
      expect(row?.description).toBe("");
    });
  });

  it("carries the ids the dedup hash is built from, and the date without time", () => {
    const row = toStatementRow(
      transaction({
        id: "abc",
        accountId: "acct-9",
        date: "2026-03-14T13:45:10.000Z",
        category: "Alimentação",
      }),
      "BANK",
    );

    expect(row).toMatchObject({
      date: "2026-03-14",
      fitId: "abc",
      acctId: "acct-9",
      providerCategory: "Alimentação",
    });
  });

  it("reports no provider category when Pluggy sent none", () => {
    expect(toStatementRow(transaction(), "BANK")?.providerCategory).toBeNull();
  });
});
