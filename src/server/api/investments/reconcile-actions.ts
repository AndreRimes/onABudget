// Makes the ledger hold what the bank holds. Runs after every background sync
// and always sides with the bank.
//
// A quantity gap is closed by one adjusting trade per asset — the "plug" —
// recomputed from scratch on every run against the ledger *without* it. So it
// heals itself: a bank that lags the ledger (a buy typed in before the bank
// shows it), or a position that arrives before its movement, produces a plug
// for a while and none once both sides agree, instead of a trail of invented
// buys and sells. Value and cost need nothing here — the bank's figures are
// already today's mark (see `bankMarksFor`).
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

import { db } from "~/server/db";
import { investmentTransactions, providerHoldings } from "~/server/db/schema";
import { todayIso } from "~/server/services/market-cache";
import { ownerHash } from "../owner-hash";
import {
  investmentRepository,
  type InvestmentTransaction,
  type InvestmentTransactionInsert,
} from "./repository";
import { bankCost, QUANTITY_TOLERANCE } from "./reconcile";

/** The adjusting trade an asset needs right now, or null when none. */
export interface Plug {
  side: "BUY" | "SELL";
  quantity: number;
  totalAmount: number;
  date: string;
}

/** Where an asset the ledger never saw is booked. */
export type PlugHome = () => Promise<{
  investmentAccountId: number;
  assetTypeId: number;
} | null>;

function precondition(message: string): TRPCError {
  return new TRPCError({ code: "PRECONDITION_FAILED", message });
}

function plugHash(userId: string, assetName: string): string {
  return ownerHash(userId, `reconcile:${assetName}`);
}

/** Float noise in a unit count, as opposed to a gap worth booking. */
const EPSILON = 1e-9;

/** The calendar day of `date` in the server's zone, as `todayIso` counts days. */
function localDay(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

/** The day before `date` — the latest day a missing buy can have happened. */
function previousDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

/** Signed units a ledger row adds to the position. */
function units(
  row: Pick<InvestmentTransaction, "transactionType" | "quantity">,
) {
  return row.transactionType === "SELL" ? -row.quantity : row.quantity;
}

/**
 * Where the plug goes and what it looks like: the asset's own most recent
 * row when it has one (same account, type and fixed-income terms), or the
 * caller's home for an asset the ledger never saw.
 */
async function tradeTemplate(
  history: InvestmentTransaction[],
  home: PlugHome | undefined,
): Promise<
  Pick<
    InvestmentTransactionInsert,
    | "investmentAccountId"
    | "assetTypeId"
    | "isFixedIncome"
    | "fixedIncomeYieldType"
    | "fixedIncomeRate"
    | "fixedIncomeMaturityDate"
    | "tesouroTitle"
    | "fundCnpj"
  >
> {
  const latest = history[0];
  if (latest) {
    return {
      investmentAccountId: latest.investmentAccountId,
      assetTypeId: latest.assetTypeId,
      isFixedIncome: latest.isFixedIncome,
      fixedIncomeYieldType: latest.fixedIncomeYieldType,
      fixedIncomeRate: latest.fixedIncomeRate,
      fixedIncomeMaturityDate: latest.fixedIncomeMaturityDate,
      tesouroTitle: latest.tesouroTitle,
      fundCnpj: latest.fundCnpj,
    };
  }
  const target = await home?.();
  if (!target) throw precondition("Escolha o tipo e a conta do ativo");
  return { ...target, isFixedIncome: false };
}

function samePlug(a: Plug | null, b: Plug | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.side === b.side &&
    a.date === b.date &&
    Math.abs(a.quantity - b.quantity) <= 1e-9 * Math.max(1, b.quantity) &&
    Math.abs(a.totalAmount - b.totalAmount) <= 0.005
  );
}

/** What the bank holds of one asset, as far as a plug needs to know. */
export interface BankPosition {
  /** Zero when the bank holds none of it. */
  quantity: number;
  unitPrice: number | null;
  unitCost: number | null;
  syncedAt: Date;
}

/**
 * The bank's position from its stored figure, or undefined when the figure
 * cannot say how many units it holds (a value without a quantity).
 */
export function bankPosition(
  fact: typeof providerHoldings.$inferSelect,
): BankPosition | undefined {
  if (!fact.syncedAt) return undefined;
  if (fact.quantity && fact.quantity > 0 && fact.value && fact.value > 0) {
    const cost = bankCost(fact);
    return {
      quantity: fact.quantity,
      unitPrice: fact.value / fact.quantity,
      unitCost: cost == null ? null : cost / fact.quantity,
      syncedAt: fact.syncedAt,
    };
  }
  // Reported with neither units nor worth: fully redeemed.
  if (!fact.quantity && !fact.value) {
    return {
      quantity: 0,
      unitPrice: null,
      unitCost: null,
      syncedAt: fact.syncedAt,
    };
  }
  return undefined;
}

/** Average cost per unit the ledger's own trades leave the position at. */
function averageCost(history: InvestmentTransaction[]): number {
  let quantity = 0;
  let cost = 0;
  for (const row of [...history].sort((a, b) =>
    a.transactionDate.localeCompare(b.transactionDate),
  )) {
    if (row.transactionType === "BUY") {
      quantity += row.quantity;
      cost += row.totalAmount;
    } else if (quantity > 0) {
      cost -= (cost / quantity) * row.quantity;
      quantity -= row.quantity;
    }
  }
  return quantity > 0 ? cost / quantity : 0;
}

/**
 * Recompute an asset's plugs against what the bank holds and write what
 * changed. Returns whether the ledger changed. `bank` null means no single
 * bank figure stands behind the asset any more (two connections report it):
 * the plugs, which only ever answered to such a figure, go.
 *
 * Units the ledger is missing are one buy, costing what the bank says the
 * position cost less what the ledger already paid for it, dated the day
 * before the ledger's first real trade (the latest day it could have
 * happened) — or, with none, the day it was first booked.
 *
 * Units the ledger has too many of are sales, one per day the surplus grew,
 * each at that day's bank price (or, for a redeemed position the bank no
 * longer prices, the ledger's average cost — no gain it cannot vouch for).
 * A sale once booked keeps its day and price. A surplus that shrinks because
 * the real sales arrived takes back the oldest plugs first (they arrive in
 * the order they happened); one that shrinks for any other reason takes
 * back the newest first.
 *
 * ponytail: an asset the ledger knows only through its buy plug vanishes
 * from history, rather than shows as sold, once the bank stops reporting it
 * — the bank never reported a movement for it either way.
 */
export async function settleQuantityTo(
  userId: string,
  assetName: string,
  bank: BankPosition | null,
  home?: PlugHome,
): Promise<boolean> {
  const buyHash = plugHash(userId, assetName);
  const rows = await investmentRepository.findByAssetName(userId, assetName);
  const isPlug = (row: InvestmentTransaction) =>
    row.sourceHash === buyHash || !!row.sourceHash?.startsWith(`${buyHash}@`);
  const history = rows.filter((row) => !isPlug(row));
  const buyRow =
    rows.find((row) => isPlug(row) && row.transactionType === "BUY") ?? null;
  const sellRows = rows
    .filter((row) => isPlug(row) && row.transactionType === "SELL")
    .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));
  const held = history.reduce((total, row) => total + units(row), 0);

  const missing = bank ? bank.quantity - held : 0;
  const tolerance = Math.max(
    QUANTITY_TOLERANCE * Math.max(bank?.quantity ?? 0, held),
    1e-9,
  );
  const gap = Math.abs(missing) > tolerance ? missing : 0;
  if (
    gap !== 0 &&
    new Set(history.map((r) => r.investmentAccountId)).size > 1
  ) {
    // The bank's figure covers its own custody only. An asset the ledger
    // also holds in another account (same ticker at a second broker) cannot
    // be made to equal it without destroying the other position.
    throw precondition("Ativo mantido em mais de uma conta");
  }

  const previousBuy: Plug | null = buyRow
    ? {
        side: "BUY",
        quantity: buyRow.quantity,
        totalAmount: buyRow.totalAmount,
        date: buyRow.transactionDate.slice(0, 10),
      }
    : null;
  let buy: Plug | null = null;
  if (bank && gap > 0) {
    // The money the ledger is missing, not the units times a price: units
    // that grew at no cost (a split, a bonus the bank never reported as a
    // movement) must not show up as a deposit nobody made.
    const totalAmount =
      bank.unitCost != null
        ? Math.max(
            0,
            bank.unitCost * bank.quantity - averageCost(history) * held,
          )
        : gap * (bank.unitPrice ?? 0);
    const earliest = history
      .map((row) => row.transactionDate.slice(0, 10))
      .sort((a, b) => a.localeCompare(b))[0];
    buy = {
      side: "BUY",
      quantity: gap,
      totalAmount,
      date: earliest
        ? previousDay(earliest)
        : (previousBuy?.date ?? localDay(bank.syncedAt)),
    };
    // Without a cost figure the amount is only today's price times the
    // units; re-pricing it daily would rewrite deposits that never moved.
    if (
      previousBuy &&
      bank.unitCost == null &&
      Math.abs(previousBuy.quantity - gap) <= 1e-9 * Math.max(1, gap)
    ) {
      buy = { ...buy, totalAmount: previousBuy.totalAmount };
    }
  }

  const writes: Array<(tx: DbTransaction) => Promise<unknown>> = [];
  if (!samePlug(previousBuy, buy)) {
    if (buyRow) writes.push((tx) => deleteRow(tx, buyRow.id));
    if (buy) {
      const plug = buy;
      const template = await tradeTemplate(
        history.length ? history : rows,
        home,
      );
      writes.push((tx) => insertPlug(tx, template, assetName, plug, buyHash));
    }
  }

  const surplus = gap < 0 ? -gap : 0;
  const booked = sellRows.reduce((total, row) => total + row.quantity, 0);
  if (surplus - booked > tolerance && bank) {
    const extra = surplus - booked;
    const price = bank.unitPrice ?? averageCost(history);
    const day = todayIso();
    const todays = sellRows.find(
      (row) => row.transactionDate.slice(0, 10) === day,
    );
    if (todays) {
      const quantity = todays.quantity + extra;
      const totalAmount = todays.totalAmount + extra * price;
      writes.push((tx) => resizeRow(tx, todays.id, quantity, totalAmount));
    } else {
      const template = await tradeTemplate(
        history.length ? history : rows,
        home,
      );
      writes.push((tx) =>
        insertPlug(
          tx,
          template,
          assetName,
          {
            side: "SELL",
            quantity: extra,
            totalAmount: extra * price,
            date: day,
          },
          `${buyHash}@${day}`,
        ),
      );
    }
  } else if (booked - surplus > tolerance) {
    // Two reasons a surplus shrinks. Real sales arriving — recorded after
    // the plugs that stood in for them — replace the oldest plugs first, in
    // the order the sales happened. Anything else (a buy the bank catches up
    // with, a count that comes back) unwinds the newest plug first, keeping
    // the earlier sales as booked.
    const since = sellRows
      .map((row) => row.createdAt ?? "")
      .sort((x, y) => x.localeCompare(y))[0];
    const arrived = history
      .filter(
        (row) =>
          row.transactionType === "SELL" &&
          since !== undefined &&
          (row.createdAt ?? "") >= since,
      )
      .reduce((total, row) => total + row.quantity, 0);
    let excess = booked - surplus;
    const replaced = Math.min(excess, arrived);
    const left = new Map(sellRows.map((row) => [row.id, row.quantity]));
    const take = (rows: InvestmentTransaction[], amount: number) => {
      let remaining = amount;
      for (const row of rows) {
        if (remaining <= EPSILON) break;
        const quantity = left.get(row.id) ?? 0;
        const taken = Math.min(quantity, remaining);
        left.set(row.id, quantity - taken);
        remaining -= taken;
      }
      return amount - remaining;
    };
    excess -= take(sellRows, replaced);
    take([...sellRows].reverse(), excess);
    for (const row of sellRows) {
      const quantity = left.get(row.id) ?? 0;
      // Row by row only float noise counts as nothing: the bank's tolerance
      // is for the whole gap, and spent per row it would add up past itself.
      if (quantity <= EPSILON) {
        writes.push((tx) => deleteRow(tx, row.id));
      } else if (row.quantity - quantity > EPSILON) {
        const totalAmount = (row.totalAmount * quantity) / row.quantity;
        writes.push((tx) => resizeRow(tx, row.id, quantity, totalAmount));
      }
    }
  }

  if (writes.length === 0) return false;
  await db.transaction(async (tx) => {
    for (const write of writes) await write(tx);
  });
  return true;
}

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function deleteRow(tx: DbTransaction, id: number) {
  await tx
    .delete(investmentTransactions)
    .where(eq(investmentTransactions.id, id));
}

async function resizeRow(
  tx: DbTransaction,
  id: number,
  quantity: number,
  totalAmount: number,
) {
  await tx
    .update(investmentTransactions)
    .set({ quantity, totalAmount, pricePerUnit: totalAmount / quantity })
    .where(eq(investmentTransactions.id, id));
}

async function insertPlug(
  tx: DbTransaction,
  template: Awaited<ReturnType<typeof tradeTemplate>>,
  assetName: string,
  plug: Plug,
  sourceHash: string,
) {
  await tx.insert(investmentTransactions).values({
    ...template,
    assetName,
    transactionType: plug.side,
    quantity: plug.quantity,
    pricePerUnit: plug.quantity > 0 ? plug.totalAmount / plug.quantity : 0,
    totalAmount: plug.totalAmount,
    transactionDate: plug.date,
    sourceHash,
  });
}

/** `settleQuantityTo` against the bank's stored figure for the asset. */
export async function settleQuantity(
  userId: string,
  assetName: string,
  home?: PlugHome,
): Promise<boolean> {
  const [fact] = await db
    .select()
    .from(providerHoldings)
    .where(
      and(
        eq(providerHoldings.userId, userId),
        eq(providerHoldings.assetName, assetName),
      ),
    );
  if (!fact) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "O banco não informou este ativo",
    });
  }
  // A figure without units says nothing about a gap; whatever plug the last
  // good figures called for stands.
  const bank = bankPosition(fact);
  return bank ? await settleQuantityTo(userId, assetName, bank, home) : false;
}

/**
 * Settle every asset in `plan` to the bank position given for it. Built by
 * the caller from one complete, successful fetch: a stored figure outside it
 * may be stale or shared, and booking a trade against it would fabricate one.
 */
export async function reconcileWithBank(
  userId: string,
  plan: ReadonlyMap<string, BankPosition | null>,
  home?: PlugHome,
): Promise<{ settled: number; failed: number }> {
  let settled = 0;
  let failed = 0;
  for (const [assetName, bank] of plan) {
    try {
      if (await settleQuantityTo(userId, assetName, bank, home)) settled++;
    } catch (error) {
      failed++;
      console.warn(
        `[reconcile] ${assetName}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { settled, failed };
}
