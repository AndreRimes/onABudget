// Reducing a raw statement description to a stable merchant key. Pure and
// dependency-free so both the import preview and the category learner agree on
// what counts as "the same merchant".
import { stripAccents } from "~/lib/parse";

/**
 * True for the monthly credit-card bill payment as it appears in a *checking*
 * statement. That line is not spending — it settles purchases that the fatura
 * import already recorded individually — so counting it too would double every
 * card expense. Detected automatically rather than left to the user, because
 * the double count is silent and distorts every total on the dashboard.
 */
export function isCardBillPayment(description: string | null): boolean {
  if (!description) return false;
  const upper = stripAccents(description).toUpperCase();
  if (!upper.includes("FATURA")) return false;
  return (
    upper.includes("PAG") || upper.includes("CARTAO") || upper.includes("CARD")
  );
}

// Boilerplate that surrounds the merchant in Brazilian statement lines and
// carries no signal about *what* was bought.
const NOISE_WORDS = new Set([
  "pix",
  "enviado",
  "recebido",
  "transferencia",
  "transf",
  "pagamento",
  "pgto",
  "compra",
  "cartao",
  "credito",
  "debito",
  "no",
  "na",
  "de",
  "da",
  "do",
  "para",
  "com",
  "em",
  "ted",
  "doc",
  "boleto",
  "tarifa",
  "conta",
  "recarga",
  "saque",
  "deposito",
  "cp",
  "cd",
  "ltda",
  "me",
  "sa",
  "eireli",
  "mei",
]);

/**
 * Reduces a statement description to a stable merchant key, so that
 * "Compra no débito - IFOOD *REST SAO JOAO 03/07" and
 * "PIX ENVIADO IFOOD 12/08" both collapse onto "IFOOD".
 *
 * Returns "" when nothing meaningful survives, in which case no suggestion is
 * made rather than a bad one.
 */
export function normalizeMerchant(description: string | null): string {
  if (!description) return "";
  const cleaned = stripAccents(description)
    .toUpperCase()
    // Dates, card masks, installment markers, document numbers.
    .replace(/\b\d{2}[/-]\d{2}([/-]\d{2,4})?\b/g, " ")
    .replace(/\bPARCELA\s*\d+\s*\/\s*\d+\b/g, " ")
    .replace(/\b\d+\s*\/\s*\d+\b/g, " ")
    .replace(/[*#]/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

  const tokens = cleaned
    .split(" ")
    .filter(Boolean)
    // Drop pure numbers and the connective boilerplate above.
    .filter((token) => !/^\d+$/.test(token))
    .filter((token) => !NOISE_WORDS.has(token.toLowerCase()))
    .filter((token) => token.length > 1);

  // The first few tokens are where the merchant name lives; the tail is
  // usually a branch, city or terminal id.
  return tokens.slice(0, 3).join(" ");
}
