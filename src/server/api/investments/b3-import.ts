// Server side of the B3 report import: dedup preview + insertion.
// Parsing of the xlsx itself happens client-side; the server receives
// normalized rows and is the authority on duplicates (via source_hash).
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "~/server/db";
import { accounts, dividends, investmentTransactions } from "~/server/db/schema";
import { matchAccountId } from "~/server/api/accounts/match";
import { b3ImportRows } from "~/server/metrics/instruments";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const b3TradeRowSchema = z.object({
  kind: z.literal("trade"),
  date: isoDate,
  ticker: z.string().min(1),
  side: z.enum(["BUY", "SELL"]),
  quantity: z.number().positive(),
  price: z.number().nonnegative(),
  amount: z.number().positive(),
  institution: z.string().default(""),
  // Renda fixa / tesouro direto rows from the Movimentação report. Negociação
  // trades (renda variável) send false.
  isFixedIncome: z.boolean().default(false),
  // Canonical Tesouro Direto title (e.g. "TESOURO IPCA+ 2050") for Tesouro
  // rows; drives mark-to-market pricing. Null for everything else.
  tesouroTitle: z.string().nullish(),
});

export const b3IncomeRowSchema = z.object({
  kind: z.literal("income"),
  date: isoDate,
  ticker: z.string().min(1),
  type: z.enum(["DIVIDEND", "JCP", "RENDIMENTO"]),
  amount: z.number().positive(),
  institution: z.string().default(""),
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

async function userInvestmentAccounts(userId: string) {
  return await db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(
      and(eq(accounts.userId, userId), eq(accounts.accountType, "INVESTMENT")),
    );
}

export async function previewB3Rows(userId: string, rows: B3Row[]) {
  const hashes = rows.map(b3SourceHash);

  const [existingTx, existingDividends, investAccounts] = await Promise.all([
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
    const duplicate = known.has(hash) || seenInFile.has(hash);
    seenInFile.add(hash);
    return {
      row,
      status: duplicate ? ("duplicate" as const) : ("new" as const),
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
      throw new Error("Conta de investimento inválida");
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

  const seenInFile = new Set<string>();
  for (const row of rows) {
    const sourceHash = b3SourceHash(row);
    if (seenInFile.has(sourceHash)) {
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
      const result = await db
        .insert(investmentTransactions)
        .values({
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
        })
        .onConflictDoNothing({ target: investmentTransactions.sourceHash })
        .returning({ id: investmentTransactions.id });
      record("trade", result.length > 0 ? "inserted" : "skipped");
    } else {
      const result = await db
        .insert(dividends)
        .values({
          investmentAccountId,
          assetName: row.ticker,
          type: row.type,
          amount: row.amount,
          paymentDate: row.date,
          source: "B3_IMPORT",
          sourceHash,
        })
        .onConflictDoNothing({ target: dividends.sourceHash })
        .returning({ id: dividends.id });
      record("income", result.length > 0 ? "inserted" : "skipped");
    }
  }

  return { inserted, skipped };
}
