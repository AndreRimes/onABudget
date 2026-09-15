// Builders for the shapes Pluggy returns, shared by every test that fakes the
// provider. Each takes `overrides` so a test states only the field it is about
// and the rest stays a plausible default — the idiom the rest of the suite
// already uses for rows and trades.
import type {
  PluggyAccount,
  PluggyInvestment,
  PluggyInvestmentTransaction,
} from "~/server/services/pluggy";

export function providerAccount(
  overrides: Partial<PluggyAccount> = {},
): PluggyAccount {
  return {
    id: "provider-account",
    itemId: "item",
    type: "BANK",
    subtype: "CHECKING_ACCOUNT",
    number: "1",
    name: "BANCO INTER",
    marketingName: null,
    balance: 0,
    currencyCode: "BRL",
    ...overrides,
  };
}

/**
 * A holding as the provider reports it. `quantity`, `value` and `balance` are
 * the figures the ledger gets checked against, so they are deliberately
 * consistent here (balance = quantity × value) and a test that wants them to
 * disagree has to say so.
 */
export function investment(
  overrides: Partial<PluggyInvestment> = {},
): PluggyInvestment {
  return {
    id: "inv-1",
    itemId: "item-1",
    name: "PETROBRAS PN",
    code: "PETR4",
    currencyCode: "BRL",
    type: "EQUITY",
    subtype: "STOCK",
    quantity: 100,
    value: 38.5,
    amount: 3850,
    balance: 3850,
    date: "2026-03-14",
    dueDate: null,
    rate: null,
    rateType: null,
    fixedAnnualRate: null,
    ...overrides,
  };
}

export function movement(
  overrides: Partial<PluggyInvestmentTransaction> = {},
): PluggyInvestmentTransaction {
  return {
    id: "mov-1",
    type: "BUY",
    description: null,
    quantity: 10,
    value: 38.5,
    amount: 385,
    date: "2026-03-14",
    tradeDate: "2026-03-13",
    ...overrides,
  };
}
