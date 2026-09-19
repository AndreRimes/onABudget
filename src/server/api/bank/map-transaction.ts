// Pure mapping from a Pluggy transaction to the app's normalized statement
// row. Deliberately free of runtime imports (types only) so it can be checked
// in isolation — the sign rule below is the one piece of this integration that
// fails silently rather than loudly when it is wrong.
import type { PluggyTransaction } from "~/server/services/pluggy";
import type { StatementRow } from "../expenses/statement-import";

/**
 * One Pluggy transaction as a statement row, or null when it must not be
 * imported.
 *
 * The sign rule differs by account kind:
 *  - BANK accounts follow `type` — DEBIT leaves the account.
 *  - CREDIT accounts invert. Pluggy documents a card expense as a *positive*
 *    amount (it adds to the bill) and paying the bill as negative, so the sign
 *    of `amount` decides and `type` is ignored.
 *
 * Getting that backwards would book every card purchase as income, which no
 * error would ever surface.
 *
 * PENDING rows are skipped: a pending transaction's id changes when it posts,
 * so importing it now would defeat the dedup hash and land the charge twice.
 */
export function toStatementRow(
  transaction: PluggyTransaction,
  accountType: "BANK" | "CREDIT",
): StatementRow | null {
  if (transaction.status === "PENDING") return null;
  if (!transaction.amount) return null;

  // On a card a positive amount is a purchase; on a bank account Pluggy
  // labels the direction itself.
  const isDebit =
    accountType === "CREDIT"
      ? transaction.amount > 0
      : transaction.type === "DEBIT";
  const kind: StatementRow["kind"] = isDebit ? "debit" : "credit";

  // The friendly description is what the categorizer learns from; the raw one
  // is only a fallback for connectors that leave it empty. "First non-empty"
  // rather than "first non-nullish": a connector that sends "" must fall
  // through to the raw description too.
  const description =
    [transaction.description, transaction.descriptionRaw]
      .map((value) => value?.trim() ?? "")
      .find((value) => value.length > 0) ?? "";

  return {
    kind,
    date: transaction.date.slice(0, 10),
    amount: Math.abs(transaction.amount),
    description,
    // Pluggy's transaction id is stable, so this produces the very same
    // `ofx:{account}:{id}` hash shape the OFX importer already dedups on —
    // re-syncing an overlapping window is a no-op for free.
    fitId: transaction.id,
    acctId: transaction.accountId,
    providerCategory: transaction.category ?? null,
  };
}
