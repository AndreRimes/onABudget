// The dedup key for imported statement rows, and nothing else.
//
// Split out of statement-import.ts so it can be exercised on its own: this is
// the logic that decides whether a charge is recorded or silently skipped, and
// a mistake here is invisible in the UI — the row simply never appears. Pure,
// with only a type-only import from its sibling, so nothing here loads the
// database.
import { normalizeMerchant } from "~/lib/merchant";
import { ownerHash } from "../owner-hash";
import type { StatementRow } from "./statement-import";

/**
 * The instalment marker of a card purchase ("(Parcela 02 de 04)", "03/12"), as
 * a hash fragment. A fatura repeats the *original purchase date* on every
 * instalment, so without this every later instalment of the same purchase
 * would hash identically to the first and be skipped as a duplicate — the
 * charge would be recorded once instead of four times.
 */
export function installmentTag(description: string): string {
  const named = /parcela\s*(\d{1,2})\s*(?:de|\/)\s*(\d{1,2})/i.exec(
    description,
  );
  if (named) return `|p${Number(named[1])}/${Number(named[2])}`;
  const bare = /\b(\d{1,2})\/(\d{1,2})\b/.exec(description);
  if (bare && Number(bare[2]) > 1 && Number(bare[1]) <= Number(bare[2])) {
    return `|p${Number(bare[1])}/${Number(bare[2])}`;
  }
  return "";
}

/**
 * Dedup key. An OFX `<FITID>` is the bank's own unique id for the transaction,
 * so when present it is exact — but it is only unique *within* an account,
 * hence the `acctId` namespace. Files without one (spreadsheets, faturas) fall
 * back to the content of the row.
 *
 * The normalized merchant (rather than the raw description) is used in the
 * fallback so that a bank rewording its own statement lines between exports
 * does not resurrect rows the user already imported.
 */
export function baseSourceHash(row: StatementRow): string {
  if (row.fitId) return `ofx:${row.acctId ?? ""}:${row.fitId}`;
  return `stmt:${row.date}|${row.amount.toFixed(2)}|${normalizeMerchant(row.description)}${installmentTag(row.description)}`;
}

/**
 * Hashes for a whole file, in order. Rows that collide on the base hash get an
 * occurrence suffix rather than being treated as duplicates of each other: two
 * coffees at the same shop for the same price on the same day are two real
 * expenses, and silently dropping the second would understate spending. The
 * suffix follows file order, so re-importing the same file still produces the
 * same hashes and still dedups perfectly.
 *
 * Credits get no hash — they are never written.
 *
 * Every hash is namespaced by its owner (see `ownerHash`): the same statement
 * line in two users' files is two rows, never a duplicate.
 */
export function computeHashes(
  userId: string,
  rows: StatementRow[],
): Array<string | null> {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    if (row.kind !== "debit") return null;
    const base = baseSourceHash(row);
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return ownerHash(userId, occurrence === 0 ? base : `${base}#${occurrence}`);
  });
}
