export type AccountType = "CHECKING" | "INVESTMENT" | "CREDIT_CARD";

export const ACCOUNT_TYPES: readonly AccountType[] = [
  "CHECKING",
  "INVESTMENT",
  "CREDIT_CARD",
];

/**
 * Account types that expenses can hang off. A credit card is a spending
 * account just like a checking account — the difference is only where the
 * money comes from — so anything that lists "accounts you can file an expense
 * against" must use this rather than testing for CHECKING.
 */
export const SPENDING_ACCOUNT_TYPES = ["CHECKING", "CREDIT_CARD"] as const;

export function isSpendingAccount(account: { accountType: string }): boolean {
  return (SPENDING_ACCOUNT_TYPES as readonly string[]).includes(
    account.accountType,
  );
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CHECKING: "Conta corrente",
  INVESTMENT: "Investimentos",
  CREDIT_CARD: "Cartão de crédito",
};
