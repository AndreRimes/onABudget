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
import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { nextCategoryColor } from "~/lib/category-colors";
import { chunk } from "~/lib/chunk";
import { isCardBillPayment, normalizeMerchant } from "~/lib/merchant";
import { db } from "~/server/db";
import { expenseCategories, expenses } from "~/server/db/schema";
import { computeHashes } from "./statement-hash";
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
  description: z.string().max(500).default(""),
  fitId: z.string().max(200).nullish(),
  acctId: z.string().max(200).nullish(),
  providerCategory: z.string().max(200).nullish(),
});

export type StatementRow = z.infer<typeof statementRowSchema>;

function nonBlank(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (text) return text;
  return null;
}

/** Rows per INSERT statement — see the note in `chunk`. */
const INSERT_CHUNK_SIZE = 200;

export type PreviewStatus = "new" | "duplicate" | "credit" | "ignored";
type IgnoreReason = "rule" | "card-bill" | null;

export async function previewStatementRows(
  userId: string,
  rows: StatementRow[],
  institution: string,
) {
  const hashes = computeHashes(userId, rows);
  const realHashes = hashes.filter((hash): hash is string => hash !== null);

  const [existing, spendingAccounts, categorizer, categories] =
    await Promise.all([
      realHashes.length > 0
        ? db
            .select({ sourceHash: expenses.sourceHash })
            .from(expenses)
            .where(inArray(expenses.sourceHash, realHashes))
        : Promise.resolve([]),
      accountRepository.findSpendingAccounts(userId),
      loadCategorizer(userId),
      db
        .select({ id: expenseCategories.id, name: expenseCategories.name })
        .from(expenseCategories)
        .where(eq(expenseCategories.userId, userId)),
    ]);

  const categoryByNormalizedName = new Map(
    categories.map((category) => [
      normalizeMerchant(category.name),
      category.id,
    ]),
  );

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

    const providerCategory = nonBlank(row.providerCategory);
    const providerCategoryId = providerCategory
      ? (categoryByNormalizedName.get(normalizeMerchant(providerCategory)) ??
        null)
      : null;
    const suggestion = categorizer.suggest(row.description);
    return {
      row,
      hash,
      status: (known.has(hash) ? "duplicate" : "new") as PreviewStatus,
      ignoreReason: null as IgnoreReason,
      providerCategory,
      suggestedCategoryId: providerCategoryId ?? suggestion.categoryId,
      suggestionSource: providerCategoryId
        ? "pluggy"
        : (suggestion.source as string | null),
    };
  });

  return {
    rows: previewRows,
    suggestedAccountId: matchAccountId(institution, spendingAccounts),
  };
}

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface ImportCandidate {
  hash: string;
  categoryId: number | null;
  providerCategory: string | null;
  row: StatementRow;
}

interface ImportedExpense {
  description: string;
  categoryId: number;
}

/**
 * Create the categories the user accepted from Pluggy, once per name, and
 * return name -> id. Categories are per-owner, so both the conflict target
 * and the read-back are keyed by (userId, name) — the same name under another
 * account is a different category, not a conflict.
 */
async function ensureProviderCategories(
  tx: DbTransaction,
  userId: string,
  names: string[],
): Promise<Map<string, number>> {
  const providerCategoryIds = new Map<string, number>();
  // Colours already spoken for, so each category the import creates gets
  // a hue of its own instead of every one of them sharing a default.
  const usedColors = (
    await tx
      .select({ color: expenseCategories.color })
      .from(expenseCategories)
      .where(eq(expenseCategories.userId, userId))
  ).map((row) => row.color);
  for (const name of new Set(names)) {
    const color = nextCategoryColor(usedColors);
    const inserted = await tx
      .insert(expenseCategories)
      .values({ userId, name, color })
      .onConflictDoNothing({
        target: [expenseCategories.userId, expenseCategories.name],
      })
      .returning({ id: expenseCategories.id });
    // Only a row that was actually written claims the colour; on a
    // conflict the existing category keeps whatever colour it has.
    if (inserted.length > 0) usedColors.push(color);
    const [category] = await tx
      .select({ id: expenseCategories.id })
      .from(expenseCategories)
      .where(
        and(
          eq(expenseCategories.userId, userId),
          eq(expenseCategories.name, name),
        ),
      );
    if (category) providerCategoryIds.set(name, category.id);
  }
  return providerCategoryIds;
}

/** Write the candidates as expenses; duplicates count as skipped. */
async function insertCandidates(
  tx: DbTransaction,
  accountId: number,
  candidates: ImportCandidate[],
  providerCategoryIds: Map<string, number>,
): Promise<{ inserted: number; skipped: number; imported: ImportedExpense[] }> {
  let inserted = 0;
  let skipped = 0;
  const imported: ImportedExpense[] = [];

  // Shape every row first, then write them in batches: one awaited
  // INSERT per row turned a 5000-line statement into 5000 sequential
  // round trips inside a single transaction.
  const pending: Array<{
    values: typeof expenses.$inferInsert;
    description: string;
    categoryId: number;
  }> = [];

  for (const candidate of candidates) {
    const categoryId =
      candidate.categoryId ??
      (candidate.providerCategory
        ? providerCategoryIds.get(candidate.providerCategory)
        : undefined);
    if (categoryId === undefined) {
      skipped++;
      continue;
    }
    pending.push({
      values: {
        checkingAccountId: accountId,
        categoryId,
        description: candidate.row.description || null,
        amount: candidate.row.amount,
        expenseDate: candidate.row.date,
        source: "IMPORT",
        sourceHash: candidate.hash,
      },
      description: candidate.row.description,
      categoryId,
    });
  }

  // Returning the source hash rather than the id keeps the counters exact:
  // `onConflictDoNothing` drops rows already imported, so the hashes that
  // come back are precisely the ones written — and only those are learned
  // from, so a duplicate never re-teaches the categorizer.
  for (const batch of chunk(pending, INSERT_CHUNK_SIZE)) {
    const written = await tx
      .insert(expenses)
      .values(batch.map((entry) => entry.values))
      .onConflictDoNothing({ target: expenses.sourceHash })
      .returning({ sourceHash: expenses.sourceHash });
    const writtenHashes = new Set(written.map((entry) => entry.sourceHash));

    for (const entry of batch) {
      if (writtenHashes.has(entry.values.sourceHash!)) {
        inserted++;
        imported.push({
          description: entry.description,
          categoryId: entry.categoryId,
        });
      } else skipped++;
    }
  }

  return { inserted, skipped, imported };
}

export async function importStatementRows(input: {
  userId: string;
  accountId: number;
  /** categoryId per row, keyed by that row's source hash. */
  categoryByHash: Record<string, number>;
  /** Rows where the user accepted Pluggy's suggested category label. */
  pluggyCategoryHashes: string[];
  /** Hashes the user marked as "not an expense". */
  ignoredHashes: string[];
  rows: StatementRow[];
}) {
  const {
    userId,
    accountId,
    categoryByHash,
    pluggyCategoryHashes,
    ignoredHashes,
    rows,
  } = input;

  // The target account must belong to the caller and be able to hold expenses.
  if (!(await accountRepository.ownsSpendingAccount(userId, accountId))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Conta inválida" });
  }

  const hashes = computeHashes(userId, rows);
  const ignored = new Set(ignoredHashes);
  const acceptedPluggy = new Set(pluggyCategoryHashes);

  const candidates: ImportCandidate[] = [];
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
    const providerCategory = nonBlank(row.providerCategory);
    if (
      categoryId === undefined &&
      !(acceptedPluggy.has(hash) && providerCategory)
    ) {
      skipped++;
      return;
    }
    candidates.push({
      hash,
      categoryId: categoryId ?? null,
      providerCategory: acceptedPluggy.has(hash) ? providerCategory : null,
      row,
    });
  });

  let inserted = 0;
  let imported: ImportedExpense[] = [];
  if (candidates.length > 0) {
    await db.transaction(async (tx) => {
      const providerCategoryIds = await ensureProviderCategories(
        tx,
        userId,
        candidates
          .map((candidate) => candidate.providerCategory)
          .filter((name): name is string => !!name),
      );
      const outcome = await insertCandidates(
        tx,
        accountId,
        candidates,
        providerCategoryIds,
      );
      inserted = outcome.inserted;
      skipped += outcome.skipped;
      imported = outcome.imported;
    });
  }

  // Learn from what the user confirmed, so the next import is pre-filled.
  await rememberCategories(userId, imported);
  if (toIgnore.length > 0) await rememberIgnored(userId, toIgnore);

  return { inserted, skipped };
}
