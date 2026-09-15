// Server side of the B3 report import: dedup preview + insertion.
// Parsing of the xlsx itself happens client-side; the server receives
// normalized rows and is the authority on duplicates (via source_hash).
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { chunk } from "~/lib/chunk";
import { db } from "~/server/db";
import {
  accounts,
  dividends,
  investmentTransactions,
} from "~/server/db/schema";
import { matchAccountId } from "~/server/api/accounts/match";
import { ownerHash } from "../owner-hash";
import {
  incomeMovementKey,
  loadForeignMovementKeys,
  tradeMovementKey,
} from "./ledger-dedup";
import { b3ImportRows } from "~/server/metrics/instruments";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const b3TradeRowSchema = z.object({
  kind: z.literal("trade"),
  date: isoDate,
  ticker: z.string().max(200).min(1),
  side: z.enum(["BUY", "SELL"]),
  quantity: z.number().positive(),
  price: z.number().nonnegative(),
  amount: z.number().positive(),
  institution: z.string().max(200).default(""),
  // Renda fixa / tesouro direto rows from the Movimentação report. Negociação
  // trades (renda variável) send false.
  isFixedIncome: z.boolean().default(false),
  // Canonical Tesouro Direto title (e.g. "TESOURO IPCA+ 2050") for Tesouro
  // rows; drives mark-to-market pricing. Null for everything else.
  tesouroTitle: z.string().max(200).nullish(),
});

export const b3IncomeRowSchema = z.object({
  kind: z.literal("income"),
  date: isoDate,
  ticker: z.string().max(200).min(1),
  type: z.enum(["DIVIDEND", "JCP", "RENDIMENTO"]),
  amount: z.number().positive(),
  institution: z.string().max(200).default(""),
});

export const b3RowSchema = z.discriminatedUnion("kind", [
  b3TradeRowSchema,
  b3IncomeRowSchema,
]);

export type B3Row = z.infer<typeof b3RowSchema>;

export function b3SourceHash(row: B3Row): string {
  const quantity = row.kind === "trade" ? row.quantity : 0;
  // Institution is deliberately NOT part of the hash: it keeps dedup stable
  // against rows imported before per-institution routing existed. (The odds of
  // the same ticker/qty/price/day at two different brokers are negligible.)
  return `${row.kind}|${row.date}|${row.ticker}|${quantity}|${row.amount.toFixed(2)}`;
}

/**
 * The row as a ledger movement, for dedup against what other sources already
 * imported. See ledger-dedup.ts: the source hash alone cannot see a trade that
 * also arrived through Open Finance.
 */
function b3MovementKey(row: B3Row): string {
  return row.kind === "trade"
    ? tradeMovementKey({
        assetName: row.ticker,
        date: row.date,
        side: row.side,
        quantity: row.quantity,
        amount: row.amount,
      })
    : incomeMovementKey({
        assetName: row.ticker,
        date: row.date,
        amount: row.amount,
      });
}

async function userInvestmentAccounts(userId: string) {
  return await db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(
      and(eq(accounts.userId, userId), eq(accounts.accountType, "INVESTMENT")),
    );
}

export async function previewB3Rows(userId: string, rows: B3Row[]) {
  const hashes = rows.map((row) => ownerHash(userId, b3SourceHash(row)));

  const [existingTx, existingDividends, investAccounts, ledgerKeys] =
    await Promise.all([
      hashes.length > 0
        ? db
            .select({ sourceHash: investmentTransactions.sourceHash })
            .from(investmentTransactions)
            .where(inArray(investmentTransactions.sourceHash, hashes))
        : Promise.resolve([]),
      hashes.length > 0
        ? db
            .select({ sourceHash: dividends.sourceHash })
            .from(dividends)
            .where(inArray(dividends.sourceHash, hashes))
        : Promise.resolve([]),
      userInvestmentAccounts(userId),
      loadForeignMovementKeys(
        userId,
        rows.map((row) => row.ticker),
        "B3",
      ),
    ]);

  const known = new Set(
    [...existingTx, ...existingDividends]
      .map((row) => row.sourceHash)
      .filter(Boolean),
  );

  // Tickers that already have transactions (so the UI only asks for an asset
  // type on genuinely new tickers).
  const userTransactions = await db
    .select({
      assetName: investmentTransactions.assetName,
      assetTypeId: investmentTransactions.assetTypeId,
    })
    .from(investmentTransactions)
    .innerJoin(
      accounts,
      eq(investmentTransactions.investmentAccountId, accounts.id),
    )
    .where(eq(accounts.userId, userId));
  const knownTickers = new Map(
    userTransactions.map((tx) => [tx.assetName, tx.assetTypeId]),
  );

  const seenInFile = new Set<string>();
  const previewRows = rows.map((row, index) => {
    const hash = hashes[index]!;
    // A movement already in the ledger under another source's hash — the same
    // trade imported from Open Finance — is a duplicate too, even though this
    // file has never been imported.
    const imported = ledgerKeys.has(b3MovementKey(row));
    const duplicate = known.has(hash) || seenInFile.has(hash) || imported;
    seenInFile.add(hash);
    return {
      row,
      status: duplicate ? ("duplicate" as const) : ("new" as const),
      /** True when the duplicate came from another source, not from this file. */
      importedElsewhere: imported && !known.has(hash),
      knownTicker: row.kind === "income" ? true : knownTickers.has(row.ticker),
    };
  });

  // Distinct institutions present in the file, each with an auto-matched
  // account so the UI can pre-fill the assignment.
  const institutionSet = new Set(rows.map((row) => row.institution));
  const institutions = [...institutionSet].map((institution) => ({
    institution,
    suggestedAccountId: matchAccountId(institution, investAccounts),
  }));

  return { rows: previewRows, institutions };
}

/** Rows per INSERT statement — see the note in `chunk`. */
const INSERT_CHUNK_SIZE = 200;

export async function importB3Rows(input: {
  userId: string;
  accountByInstitution: Record<string, number>;
  assetTypeByTicker: Record<string, number>;
  rows: B3Row[];
}) {
  const { userId, accountByInstitution, assetTypeByTicker, rows } = input;

  // Every account the caller wants to write to must belong to them.
  const investAccounts = await userInvestmentAccounts(userId);
  const ownedAccountIds = new Set(investAccounts.map((account) => account.id));
  for (const accountId of Object.values(accountByInstitution)) {
    if (!ownedAccountIds.has(accountId)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Conta de investimento inválida",
      });
    }
  }

  const userTransactions = await db
    .select({
      assetName: investmentTransactions.assetName,
      assetTypeId: investmentTransactions.assetTypeId,
    })
    .from(investmentTransactions)
    .innerJoin(
      accounts,
      eq(investmentTransactions.investmentAccountId, accounts.id),
    )
    .where(eq(accounts.userId, userId));
  const knownTickers = new Map(
    userTransactions.map((tx) => [tx.assetName, tx.assetTypeId]),
  );

  // Movements another source already imported. Only those: within B3 itself
  // the source hash is the authority, and two identical fills on one day are
  // two real trades.
  const ledgerKeys = await loadForeignMovementKeys(
    userId,
    rows.map((row) => row.ticker),
    "B3",
  );

  let inserted = 0;
  let skipped = 0;

  // Rows are counted here rather than in the router: the router only ever sees
  // the {inserted, skipped} totals and would lose the trade/income split.
  const record = (
    kind: "trade" | "income",
    outcome: "inserted" | "skipped",
  ) => {
    if (outcome === "inserted") inserted++;
    else skipped++;
    b3ImportRows.inc({ kind, outcome });
  };

  // Rows are validated and shaped first, then written in batches. The previous
  // version awaited one INSERT per row, which on a full B3 export meant
  // thousands of sequential round trips — and, with no transaction around
  // them, a failure halfway through left the file half imported.
  const tradeValues: Array<typeof investmentTransactions.$inferInsert> = [];
  const incomeValues: Array<typeof dividends.$inferInsert> = [];

  const seenInFile = new Set<string>();
  for (const row of rows) {
    const sourceHash = ownerHash(userId, b3SourceHash(row));
    // Both guards matter: the hash catches this file arriving twice, the
    // movement key catches the same trade already imported from Pluggy.
    if (seenInFile.has(sourceHash) || ledgerKeys.has(b3MovementKey(row))) {
      record(row.kind, "skipped");
      continue;
    }
    seenInFile.add(sourceHash);

    const investmentAccountId = accountByInstitution[row.institution];
    if (investmentAccountId === undefined) {
      record(row.kind, "skipped");
      continue;
    }

    if (row.kind === "trade") {
      const assetTypeId =
        assetTypeByTicker[row.ticker] ?? knownTickers.get(row.ticker);
      if (assetTypeId === undefined) {
        record("trade", "skipped");
        continue;
      }
      tradeValues.push({
        investmentAccountId,
        assetTypeId,
        assetName: row.ticker,
        transactionType: row.side,
        quantity: row.quantity,
        pricePerUnit: row.price,
        totalAmount: row.amount,
        transactionDate: row.date,
        // Fixed-income (renda fixa / tesouro) rows carry no yield metadata in
        // the B3 file; the yield type / rate / maturity stay null and can be
        // filled in later via the edit flow.
        isFixedIncome: row.isFixedIncome,
        tesouroTitle: row.tesouroTitle ?? null,
        sourceHash,
      });
    } else {
      incomeValues.push({
        investmentAccountId,
        assetName: row.ticker,
        type: row.type,
        amount: row.amount,
        paymentDate: row.date,
        source: "B3_IMPORT",
        sourceHash,
      });
    }
  }

  // `returning` the source hash rather than the id is what keeps the counters
  // exact: `onConflictDoNothing` silently drops the rows already present, so
  // the returned hashes are precisely the ones that were really written.
  if (tradeValues.length > 0 || incomeValues.length > 0) {
    await db.transaction(async (tx) => {
      for (const batch of chunk(tradeValues, INSERT_CHUNK_SIZE)) {
        const written = await tx
          .insert(investmentTransactions)
          .values(batch)
          .onConflictDoNothing({ target: investmentTransactions.sourceHash })
          .returning({ sourceHash: investmentTransactions.sourceHash });
        const writtenHashes = new Set(written.map((entry) => entry.sourceHash));
        for (const value of batch) {
          record(
            "trade",
            writtenHashes.has(value.sourceHash!) ? "inserted" : "skipped",
          );
        }
      }

      for (const batch of chunk(incomeValues, INSERT_CHUNK_SIZE)) {
        const written = await tx
          .insert(dividends)
          .values(batch)
          .onConflictDoNothing({ target: dividends.sourceHash })
          .returning({ sourceHash: dividends.sourceHash });
        const writtenHashes = new Set(written.map((entry) => entry.sourceHash));
        for (const value of batch) {
          record(
            "income",
            writtenHashes.has(value.sourceHash!) ? "inserted" : "skipped",
          );
        }
      }
    });
  }

  return { inserted, skipped };
}
