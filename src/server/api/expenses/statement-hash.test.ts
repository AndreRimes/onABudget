import { describe, expect, it } from "vitest";

import type { StatementRow } from "./statement-import";
import {
  baseSourceHash,
  computeHashes,
  installmentTag,
} from "./statement-hash";

function row(overrides: Partial<StatementRow> = {}): StatementRow {
  return {
    kind: "debit",
    date: "2026-03-14",
    amount: 25.4,
    description: "PADARIA CENTRAL",
    fitId: null,
    acctId: null,
    providerCategory: null,
    ...overrides,
  };
}

describe("installmentTag", () => {
  it("reads the spelled-out Brazilian form", () => {
    expect(installmentTag("MERCADO (Parcela 02 de 04)")).toBe("|p2/4");
    expect(installmentTag("MERCADO parcela 2/4")).toBe("|p2/4");
  });

  it("normalizes leading zeros so the same instalment hashes once", () => {
    expect(installmentTag("LOJA (Parcela 02 de 04)")).toBe(
      installmentTag("LOJA (Parcela 2 de 4)"),
    );
  });

  it("reads the bare N/M form", () => {
    expect(installmentTag("NETSHOES 03/12")).toBe("|p3/12");
  });

  it("ignores N/M shapes that cannot be an instalment", () => {
    // A single instalment of one, and an index past the total: both are far
    // more likely to be a date or an order number than a real instalment.
    expect(installmentTag("COMPRA 1/1")).toBe("");
    expect(installmentTag("COMPRA 13/12")).toBe("");
  });

  it("returns nothing for an ordinary description", () => {
    expect(installmentTag("PADARIA CENTRAL")).toBe("");
  });
});

describe("baseSourceHash", () => {
  it("uses the bank's own id when the file carries one", () => {
    expect(baseSourceHash(row({ fitId: "XYZ", acctId: "1234" }))).toBe(
      "ofx:1234:XYZ",
    );
  });

  it("namespaces the bank id by account", () => {
    // A FITID is only unique *within* an account, so the same id under two
    // accounts must not collide.
    expect(baseSourceHash(row({ fitId: "XYZ", acctId: "1111" }))).not.toBe(
      baseSourceHash(row({ fitId: "XYZ", acctId: "2222" })),
    );
  });

  it("survives the bank rewording its own statement line", () => {
    // The fallback hashes the *normalized merchant*, so an export that adds
    // boilerplate around the same merchant does not resurrect an imported row.
    expect(
      baseSourceHash(row({ description: "PAGAMENTO PADARIA CENTRAL" })),
    ).toBe(baseSourceHash(row({ description: "Compra no PADARIA CENTRAL" })));
  });

  it("separates the instalments of one purchase", () => {
    // A fatura repeats the original purchase date on every instalment; without
    // the tag, instalments 2..4 would all look like duplicates of the first.
    const first = baseSourceHash(row({ description: "LOJA (Parcela 1 de 4)" }));
    const second = baseSourceHash(
      row({ description: "LOJA (Parcela 2 de 4)" }),
    );
    expect(first).not.toBe(second);
  });

  it("distinguishes rows by date and amount", () => {
    expect(baseSourceHash(row())).not.toBe(
      baseSourceHash(row({ amount: 25.5 })),
    );
    expect(baseSourceHash(row())).not.toBe(
      baseSourceHash(row({ date: "2026-03-15" })),
    );
  });

  it("treats amounts that differ below the cent as the same row", () => {
    expect(baseSourceHash(row({ amount: 25.4 }))).toBe(
      baseSourceHash(row({ amount: 25.400001 })),
    );
  });
});

describe("computeHashes", () => {
  it("keeps two identical real purchases apart", () => {
    // Two coffees at the same shop for the same price on the same day are two
    // expenses; collapsing them would understate spending.
    const [first, second] = computeHashes("u1", [row(), row()]);
    expect(first).not.toBe(second);
    expect(second).toBe(`${first}#1`);
  });

  it("is stable across re-imports of the same file", () => {
    const rows = [row(), row(), row({ amount: 9 })];
    expect(computeHashes("u1", rows)).toEqual(computeHashes("u1", rows));
  });

  it("gives credits no hash at all", () => {
    // Credits are never written, so they never need a dedup key.
    expect(computeHashes("u1", [row({ kind: "credit" })])).toEqual([null]);
  });

  it("keeps the same row apart for two owners", () => {
    // `source_hash` is unique across the whole table: without the owner in the
    // key, the second person to import an identical line would lose it.
    const [mine] = computeHashes("u1", [row()]);
    const [theirs] = computeHashes("u2", [row()]);
    expect(mine).not.toBe(theirs);
    expect(mine).toBe(`u1:${baseSourceHash(row())}`);
  });

  it("does not let a credit consume an occurrence slot", () => {
    const hashes = computeHashes("u1", [row({ kind: "credit" }), row(), row()]);
    expect(hashes[0]).toBe(null);
    expect(hashes[2]).toBe(`${hashes[1]}#1`);
  });
});
