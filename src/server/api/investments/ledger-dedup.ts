// Cross-source dedup for investment movements.
//
// Each importer namespaces its own `source_hash` — B3 hashes the row's fields,
// Pluggy hashes the provider's movement ids — so the unique index only ever
// catches re-importing the *same* file or connection. The same purchase
// arriving from both sources carries two different hashes and would be written
// twice, doubling the position.
//
// So a movement is also recognised by what it is: asset, day, side, quantity
// and amount. Two rules keep that from eating real data:
//
//  - it only ever looks at rows *another* source wrote. Within one source the
//    provider's ids are authoritative, and two partial fills of one order —
//    same asset, same day, same price — are two movements, not one;
//  - it matches exactly, to the cent and to the share. A missed duplicate is
//    the status quo; a wrong match would silently swallow a real movement.
import { and, eq, inArray } from "drizzle-orm";

import { chunk } from "~/lib/chunk";
import { db } from "~/server/db";
import {
  accounts,
  dividends,
  investmentTransactions,
} from "~/server/db/schema";

/** Asset names per query, well under SQLite's variable limit. */
const NAME_CHUNK_SIZE = 200;

/** Who wrote a ledger row. Manual rows count as a source of their own. */
export type MovementSource = "B3" | "PLUGGY" | "MANUAL";

export interface TradeMovement {
  assetName: string;
  date: string;
  side: "BUY" | "SELL";
  quantity: number;
  amount: number;
}

export interface IncomeMovement {
  assetName: string;
  date: string;
  amount: number;
}

function money(value: number): string {
  return value.toFixed(2);
}

/** Trailing-zero-free quantity, so 10 and 10.000000 are one key. */
function units(value: number): string {
  return String(Math.round(value * 1e6) / 1e6);
}

export function tradeMovementKey(movement: TradeMovement): string {
  return [
    "trade",
    movement.assetName,
    movement.date,
    movement.side,
    units(movement.quantity),
    money(movement.amount),
  ].join("|");
}

/**
 * Income keys leave the type out: B3 distinguishes dividend from JCP, Pluggy
 * reports both as INTEREST, and the same payment must key the same either way.
 */
export function incomeMovementKey(movement: IncomeMovement): string {
  return [
    "income",
    movement.assetName,
    movement.date,
    money(movement.amount),
  ].join("|");
}

/**
 * Which importer wrote a transaction, read from the shape of its hash — the
 * table has no source column, and adding one would still leave every existing
 * row unlabelled.
 */
function transactionSource(sourceHash: string | null): MovementSource {
  if (!sourceHash) return "MANUAL";
  // Hashes are owner-prefixed (`{userId}:pluggy:…`, see owner-hash.ts), so
  // the importer's namespace is the segment after the owner, not the start.
  const bare = sourceHash.slice(sourceHash.indexOf(":") + 1);
  return bare.startsWith("pluggy:") ? "PLUGGY" : "B3";
}

function dividendSource(source: string): MovementSource {
  if (source === "PLUGGY_IMPORT") return "PLUGGY";
  if (source === "B3_IMPORT") return "B3";
  return "MANUAL";
}

/**
 * Keys of the movements the user's ledger already holds for the given assets
 * that some source *other* than `source` put there — the set an importer must
 * treat as already imported, on top of its own source hashes.
 */
export async function loadForeignMovementKeys(
  userId: string,
  assetNames: string[],
  source: MovementSource,
): Promise<Set<string>> {
  const names = [...new Set(assetNames.filter(Boolean))];
  const keys = new Set<string>();
  if (names.length === 0) return keys;

  const accountIds = (
    await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, userId),
          eq(accounts.accountType, "INVESTMENT"),
        ),
      )
  ).map((account) => account.id);
  if (accountIds.length === 0) return keys;

  for (const batch of chunk(names, NAME_CHUNK_SIZE)) {
    const [trades, income] = await Promise.all([
      db
        .select({
          assetName: investmentTransactions.assetName,
          date: investmentTransactions.transactionDate,
          side: investmentTransactions.transactionType,
          quantity: investmentTransactions.quantity,
          amount: investmentTransactions.totalAmount,
          sourceHash: investmentTransactions.sourceHash,
        })
        .from(investmentTransactions)
        .where(
          and(
            inArray(investmentTransactions.investmentAccountId, accountIds),
            inArray(investmentTransactions.assetName, batch),
          ),
        ),
      db
        .select({
          assetName: dividends.assetName,
          date: dividends.paymentDate,
          amount: dividends.amount,
          source: dividends.source,
        })
        .from(dividends)
        .where(
          and(
            inArray(dividends.investmentAccountId, accountIds),
            inArray(dividends.assetName, batch),
          ),
        ),
    ]);

    for (const trade of trades) {
      if (transactionSource(trade.sourceHash) === source) continue;
      keys.add(tradeMovementKey(trade));
    }
    for (const entry of income) {
      if (dividendSource(entry.source) === source) continue;
      keys.add(incomeMovementKey(entry));
    }
  }

  return keys;
}
