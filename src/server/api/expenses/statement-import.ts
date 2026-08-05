// Server side of the bank-statement / fatura import: dedup preview +
// insertion. Parsing of the OFX/CSV/xlsx/fatura happens client-side; the
// server receives normalized rows and is the authority on duplicates (via
// source_hash).
//
// Mirrors src/server/api/investments/b3-import.ts, with three deliberate
// differences: the inserts run inside a transaction, the import feeds the
// category learner so the next statement arrives pre-categorized, and rows can
// be marked "not an expense" so transfers and card-bill payments never land as
// spending.
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { isCardBillPayment, normalizeMerchant } from "~/lib/merchant";
import { db } from "~/server/db";
import { expenses } from "~/server/db/schema";
import { matchAccountId } from "../accounts/match";
import { accountRepository } from "../accounts/repository";
import {
  loadCategorizer,
  rememberCategories,
  rememberIgnored,
} from "./categorize";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const statementRowSchema = z.object({
  kind: z.enum(["debit", "credit"]),
  date: isoDate,
  amount: z.number().positive(),
  description: z.string().default(""),
  fitId: z.string().nullish(),
  acctId: z.string().nullish(),
});

export type StatementRow = z.infer<typeof statementRowSchema>;

/**
 * The instalment marker of a card purchase ("(Parcela 02 de 04)", "03/12"), as
 * a hash fragment. A fatura repeats the *original purchase date* on every
 * instalment, so without this every later instalment of the same purchase
 * would hash identically to the first and be skipped as a duplicate — the
 * charge would be recorded once instead of four times.
 */
function installmentTag(description: string): string {
  const named = /parcela\s*(\d{1,2})\s*(?:de|\/)\s*(\d{1,2})/i.exec(description);
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
function baseSourceHash(row: StatementRow): string {
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
 */
function computeHashes(rows: StatementRow[]): Array<string | null> {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    if (row.kind !== "debit") return null;
    const base = baseSourceHash(row);
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return occurrence === 0 ? base : `${base}#${occurrence}`;
  });
}

export type PreviewStatus = "new" | "duplicate" | "credit" | "ignored";
type IgnoreReason = "rule" | "card-bill" | null;

export async function previewStatementRows(
  userId: string,
  rows: StatementRow[],
  institution: string,
) {
  const hashes = computeHashes(rows);
  const realHashes = hashes.filter((hash): hash is string => hash !== null);

  const [existing, spendingAccounts, categorizer] = await Promise.all([
    realHashes.length > 0
      ? db
          .select({ sourceHash: expenses.sourceHash })
          .from(expenses)
          .where(inArray(expenses.sourceHash, realHashes))
      : Promise.resolve([]),
    accountRepository.findSpendingAccounts(userId),
    loadCategorizer(userId),
  ]);

  const known = new Set(
    existing
      .map((row) => row.sourceHash)
      .filter((hash): hash is string => !!hash),
  );

  const previewRows = rows.map((row, index) => {
    const hash = hashes[index]!;

    // Credits are never written, so they are neither deduped nor categorized —
    // they ride along purely so the preview can show they were recognised.
    if (hash === null) {
      return {
        row,
        hash: null,
        status: "credit" as PreviewStatus,
        ignoreReason: null as IgnoreReason,
        suggestedCategoryId: null as number | null,
        suggestionSource: null as string | null,
      };
    }

    // The card-bill payment in a checking statement settles purchases the
    // fatura import already recorded; counting it would double them.
    const cardBill = isCardBillPayment(row.description);
    const ruleIgnored = categorizer.isIgnored(row.description);
    if (cardBill || ruleIgnored) {
      return {
        row,
        hash,
        status: "ignored" as PreviewStatus,
        ignoreReason: (cardBill ? "card-bill" : "rule") as IgnoreReason,
        suggestedCategoryId: null as number | null,
        suggestionSource: null as string | null,
      };
    }

    const suggestion = categorizer.suggest(row.description);
    return {
      row,
      hash,
      status: (known.has(hash) ? "duplicate" : "new") as PreviewStatus,
      ignoreReason: null as IgnoreReason,
      suggestedCategoryId: suggestion.categoryId,
      suggestionSource: suggestion.source as string | null,
    };
  });

  return {
    rows: previewRows,
    suggestedAccountId: matchAccountId(institution, spendingAccounts),
  };
}

export async function importStatementRows(input: {
  userId: string;
  accountId: number;
  /** categoryId per row, keyed by that row's source hash. */
  categoryByHash: Record<string, number>;
  /** Hashes the user marked as "not an expense". */
  ignoredHashes: string[];
  rows: StatementRow[];
}) {
  const { userId, accountId, categoryByHash, ignoredHashes, rows } = input;

  // The target account must belong to the caller and be able to hold expenses.
  if (!(await accountRepository.ownsSpendingAccount(userId, accountId))) {
    throw new Error("Conta inválida");
  }

  const hashes = computeHashes(rows);
  const ignored = new Set(ignoredHashes);

  const toInsert: Array<{
    hash: string;
    categoryId: number;
    row: StatementRow;
  }> = [];
  const toIgnore: Array<string | null> = [];
  let skipped = 0;

  rows.forEach((row, index) => {
    const hash = hashes[index];
    if (!hash) {
      skipped++; // credit
      return;
    }
    if (ignored.has(hash) || isCardBillPayment(row.description)) {
      // Only an explicit choice becomes a remembered rule; the card-bill
      // heuristic already applies on its own and needs no stored pattern.
      if (ignored.has(hash)) toIgnore.push(row.description);
      skipped++;
      return;
    }
    const categoryId = categoryByHash[hash];
    if (categoryId === undefined) {
      skipped++;
      return;
    }
    toInsert.push({ hash, categoryId, row });
  });

  let inserted = 0;
  if (toInsert.length > 0) {
    await db.transaction(async (tx) => {
      for (const entry of toInsert) {
        const result = await tx
          .insert(expenses)
          .values({
            checkingAccountId: accountId,
            categoryId: entry.categoryId,
            description: entry.row.description || null,
            amount: entry.row.amount,
            expenseDate: entry.row.date,
            source: "IMPORT",
            sourceHash: entry.hash,
          })
          .onConflictDoNothing({ target: expenses.sourceHash })
          .returning({ id: expenses.id });
        if (result.length > 0) inserted++;
        else skipped++;
      }
    });
  }

  // Learn from what the user confirmed, so the next import is pre-filled.
  await rememberCategories(
    userId,
    toInsert.map((entry) => ({
      description: entry.row.description,
      categoryId: entry.categoryId,
    })),
  );
  if (toIgnore.length > 0) await rememberIgnored(userId, toIgnore);

  return { inserted, skipped };
}
