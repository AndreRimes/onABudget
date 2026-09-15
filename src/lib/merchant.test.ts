import { describe, expect, it } from "vitest";

import { isCardBillPayment, normalizeMerchant } from "./merchant";

describe("normalizeMerchant", () => {
  it("collapses the same merchant seen through different statement wordings", () => {
    // This is the whole contract: both of these have to produce one key, or
    // the category learner treats them as two unrelated merchants.
    expect(normalizeMerchant("Compra no débito - PADARIA SAO JOAO 03/07")).toBe(
      normalizeMerchant("PIX ENVIADO PADARIA SAO JOAO"),
    );
  });

  it("keeps a marketplace's sub-merchant instead of collapsing the whole app", () => {
    // Deliberate: every iFood order sharing one key would make the learner
    // suggest one category for all delivery, whatever was actually ordered.
    expect(normalizeMerchant("IFOOD *REST SAO JOAO 03/07")).toBe(
      "IFOOD REST SAO",
    );
    expect(normalizeMerchant("IFOOD *PIZZARIA BELLA")).toBe(
      "IFOOD PIZZARIA BELLA",
    );
  });

  it("strips accents and case", () => {
    expect(normalizeMerchant("padaria são joão")).toBe(
      normalizeMerchant("PADARIA SAO JOAO"),
    );
  });

  it("drops dates, instalment markers and card masks", () => {
    expect(normalizeMerchant("NETSHOES 03/12")).toBe("NETSHOES");
    expect(normalizeMerchant("LOJA PARCELA 2/4")).toBe("LOJA");
    expect(normalizeMerchant("MERCADO *1234")).toBe("MERCADO");
    expect(normalizeMerchant("MERCADO 15/03/2026")).toBe("MERCADO");
  });

  it("drops the connective boilerplate around the merchant", () => {
    expect(normalizeMerchant("PAGAMENTO DE BOLETO AMAZON")).toBe("AMAZON");
  });

  it("keeps only the leading tokens, where the merchant name lives", () => {
    // The tail is usually a branch, city or terminal id, and including it
    // would split one merchant into a key per location.
    expect(
      normalizeMerchant("SUPERMERCADO EXTRA HIPER LOJA 4471 SAO PAULO BR"),
    ).toBe("SUPERMERCADO EXTRA HIPER");
  });

  it("returns nothing when nothing meaningful survives", () => {
    // No key means no suggestion, which is better than a wrong one.
    expect(normalizeMerchant("")).toBe("");
    expect(normalizeMerchant(null)).toBe("");
    expect(normalizeMerchant("12/08 *** 4471")).toBe("");
  });
});

describe("isCardBillPayment", () => {
  it("recognises the card bill line in a checking statement", () => {
    // Missing this double-counts every card expense: the fatura import already
    // recorded each purchase individually.
    expect(isCardBillPayment("PAGAMENTO FATURA CARTAO")).toBe(true);
    expect(isCardBillPayment("Pgto fatura cartão de crédito")).toBe(true);
    expect(isCardBillPayment("PAG FATURA")).toBe(true);
  });

  it("leaves ordinary spending alone", () => {
    expect(isCardBillPayment("PADARIA CENTRAL")).toBe(false);
    expect(isCardBillPayment("PAGAMENTO BOLETO ENERGIA")).toBe(false);
    expect(isCardBillPayment(null)).toBe(false);
  });

  it("does not fire on the word fatura alone", () => {
    // "FATURA" with no payment verb is more likely a bill being charged than
    // the monthly settlement of a card.
    expect(isCardBillPayment("FATURA INTERNET")).toBe(false);
  });
});
