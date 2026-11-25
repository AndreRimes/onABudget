// Which ledger asset a fixed-income holding reported by the bank already is.
//
// The bank names a holding by its code. The ledger may keep the same holding
// under another name: a B3 import the owner renamed to something readable, a
// Tesouro title B3 spells in full while the bank sends its ISIN, a CDB typed
// in by hand. Taken at its code, the holding came in a second time. Here each
// one is first recognised as the asset the ledger already has, so everything
// downstream (dedup, bank marks, reconciliation) sees a single asset.
//
// Only fixed income: tickers and fund CNPJs are the same key everywhere.
import { and, eq, inArray } from "drizzle-orm";

import { db } from "~/server/db";
import {
  accounts,
  dividends,
  investmentTransactions,
} from "~/server/db/schema";
import type {
  PluggyInvestment,
  PluggyInvestmentTransaction,
} from "~/server/services/pluggy";
import { b3TickerOf } from "../investments/ledger-dedup";
import { ownerHash } from "../owner-hash";
import {
  holdingShortfall,
  normalizeInvestmentMovements,
  normalizeOpeningPosition,
  normalizeShortfallPosition,
  pluggyInvestmentSourceHash,
  type PluggyInvestmentRow,
} from "./investment-import";

export interface InvestmentBatch {
  investment: PluggyInvestment;
  movements: PluggyInvestmentTransaction[];
}

type UnitRow = Extract<PluggyInvestmentRow, { kind: "trade" | "position" }>;
type LedgerRow = Awaited<ReturnType<typeof loadLedger>>[number];
/** What tells two records of one movement apart from two movements. */
type Event = { side: "BUY" | "SELL"; date: string; amount: number };

const DAY_MS = 24 * 60 * 60 * 1000;
/** B3 dates a Tesouro buy at settlement, the bank at the order. */
const DAYS_APART = 3;
/** Both sides round the amount to the cent on their own. */
const CENTS_APART = 0.02;

function dayGap(a: Event, b: Event): number {
  return (
    Math.abs(
      Date.parse(a.date.slice(0, 10)) - Date.parse(b.date.slice(0, 10)),
    ) / DAY_MS
  );
}

function sameEvent(a: Event, b: Event): boolean {
  return (
    a.side === b.side &&
    Math.abs(a.amount - b.amount) <= CENTS_APART + 1e-9 &&
    dayGap(a, b) <= DAYS_APART
  );
}

/** Take the row of `pool` that records the same event, closest day first. */
function takeMatch<T extends Event>(pool: T[], event: Event): T | undefined {
  const match = pool
    .filter((row) => sameEvent(row, event))
    .sort((a, b) => dayGap(a, event) - dayGap(b, event))[0];
  if (match) pool.splice(pool.indexOf(match), 1);
  return match;
}

function codeOf(investment: PluggyInvestment): string {
  return investment.code?.trim() ?? "";
}

function keyOf(investment: PluggyInvestment): string {
  return codeOf(investment) || investment.name.trim();
}

function isFixedIncome({ investment }: InvestmentBatch): boolean {
  return investment.type === "FIXED_INCOME" && keyOf(investment) !== "";
}

/** The hash without its owner prefix. */
function bareHash(row: { sourceHash: string | null }): string {
  return row.sourceHash?.slice(row.sourceHash.indexOf(":") + 1) ?? "";
}

/** The Pluggy investment a ledger row came from, when one wrote it. */
function pluggyIdOf(row: LedgerRow): string | null {
  return (
    /^pluggy:(?:investment|position):([^:]+)/.exec(bareHash(row))?.[1] ?? null
  );
}

function isPlug(row: LedgerRow): boolean {
  return bareHash(row).startsWith("reconcile:");
}

/** Written by the owner or a B3 file, not by the bank. */
function isForeign(row: LedgerRow): boolean {
  return pluggyIdOf(row) === null && !isPlug(row);
}

async function loadLedger(userId: string) {
  return await db
    .select({
      id: investmentTransactions.id,
      assetName: investmentTransactions.assetName,
      side: investmentTransactions.transactionType,
      quantity: investmentTransactions.quantity,
      date: investmentTransactions.transactionDate,
      amount: investmentTransactions.totalAmount,
      isFixedIncome: investmentTransactions.isFixedIncome,
      yieldType: investmentTransactions.fixedIncomeYieldType,
      rate: investmentTransactions.fixedIncomeRate,
      tesouroTitle: investmentTransactions.tesouroTitle,
      sourceHash: investmentTransactions.sourceHash,
    })
    .from(investmentTransactions)
    .innerJoin(
      accounts,
      eq(accounts.id, investmentTransactions.investmentAccountId),
    )
    .where(eq(accounts.userId, userId));
}

/** Whether these rows add up to the units the bank reports (0.5% of rounding). */
function covers(rows: LedgerRow[], { quantity }: PluggyInvestment): boolean {
  if (!quantity || quantity <= 0) return false;
  const units = rows.reduce(
    (total, row) => total + (row.side === "BUY" ? 1 : -1) * row.quantity,
    0,
  );
  return units >= quantity * 0.995;
}

/** Every buy and sell the bank's figures for a holding amount to. */
function unitRows({ investment, movements }: InvestmentBatch): UnitRow[] {
  if (movements.length === 0) {
    const opening = normalizeOpeningPosition(investment);
    return opening?.kind === "position" ? [opening] : [];
  }
  const { rows } = normalizeInvestmentMovements(investment, movements);
  const shortfall = holdingShortfall(investment, rows);
  const missing = shortfall
    ? normalizeShortfallPosition(investment, shortfall, rows)
    : null;
  return [...rows, ...(missing ? [missing] : [])].filter(
    (row): row is UnitRow => row.kind !== "income",
  );
}

function eventOf(row: UnitRow): Event {
  return {
    side: row.kind === "position" ? "BUY" : row.side,
    date: row.date,
    amount: row.amount,
  };
}

function sameTerms(row: UnitRow, ledger: LedgerRow): boolean {
  const { fixedIncomeRate: rate, fixedIncomeYieldType: type } = row;
  if (rate == null || ledger.rate == null) return true;
  return type === ledger.yieldType && Math.abs(rate - ledger.rate) < 1e-6;
}

/**
 * Some connectors report one holding twice, the copy without a code but with
 * the very same movements. The copy is left out.
 */
function splitTwins(batches: InvestmentBatch[]) {
  const twins: Array<{ twin: InvestmentBatch; of: InvestmentBatch }> = [];
  for (const twin of batches) {
    if (!isFixedIncome(twin) || codeOf(twin.investment)) continue;
    if (twin.movements.length === 0) continue;
    const of = batches.find(
      (other) =>
        isFixedIncome(other) &&
        codeOf(other.investment) !== "" &&
        other.investment.name.trim() === twin.investment.name.trim() &&
        other.investment.dueDate === twin.investment.dueDate &&
        isSubset(twin.movements, other.movements),
    );
    if (of) twins.push({ twin, of });
  }
  const dropped = new Set(twins.map(({ twin }) => twin));
  return { twins, kept: batches.filter((batch) => !dropped.has(batch)) };
}

function isSubset(
  part: PluggyInvestmentTransaction[],
  whole: PluggyInvestmentTransaction[],
): boolean {
  const key = (m: PluggyInvestmentTransaction) =>
    `${m.type}|${(m.tradeDate || m.date)?.slice(0, 10)}|${m.quantity}|${m.amount}`;
  const left = whole.map(key);
  return part.every((movement) => {
    const index = left.indexOf(key(movement));
    if (index < 0) return false;
    left.splice(index, 1);
    return true;
  });
}

/** Names the ledger keeps rows of `investment` under, going by their hashes. */
function nameByProvenance(
  investment: PluggyInvestment,
  ledger: LedgerRow[],
): string | null {
  const code = codeOf(investment);
  const byTicker = new Set(
    ledger
      .filter((row) => code && b3TickerOf(row.sourceHash) === code)
      .map((row) => row.assetName),
  );
  // One name, standing for this code alone: an asset two codes were renamed
  // into is not what the bank reports under either.
  if (byTicker.size === 1) {
    const [name] = byTicker;
    const tickers = new Set(
      ledger
        .filter((row) => row.assetName === name)
        .map((row) => b3TickerOf(row.sourceHash))
        .filter(Boolean),
    );
    return tickers.size === 1 ? name! : null;
  }
  if (byTicker.size > 1) return null;
  const byId = new Set(
    ledger
      .filter((row) => pluggyIdOf(row) === investment.id)
      .map((row) => row.assetName)
      .filter((name) => name !== keyOf(investment)),
  );
  return byId.size === 1 ? [...byId][0]! : null;
}

/** Ledger assets that record the same buys as `batch`, under another name. */
function namesByContent(
  batch: InvestmentBatch,
  candidates: Map<string, LedgerRow[]>,
): string[] {
  const rows = unitRows(batch);
  const matches = (ledger: LedgerRow) =>
    rows.some(
      (row) => sameEvent(eventOf(row), ledger) && sameTerms(row, ledger),
    );
  return [...candidates]
    .filter(([, asset]) => {
      const buys = asset.filter((row) => row.side === "BUY");
      const title = asset[0]!.tesouroTitle;
      if (title) {
        const year = /\d{4}$/.exec(title)?.[0];
        return (
          !!year &&
          batch.investment.dueDate?.slice(0, 4) === year &&
          (buys.some(matches) || covers(asset, batch.investment))
        );
      }
      // A name typed by hand says nothing, so every buy under it has to match.
      return buys.length > 0 && buys.every(matches);
    })
    .map(([name]) => name);
}

/** Investment id → the other name the ledger already keeps the holding under. */
function resolveNames(batches: InvestmentBatch[], ledger: LedgerRow[]) {
  const rowsByName = new Map<string, LedgerRow[]>();
  for (const row of ledger) {
    const rows = rowsByName.get(row.assetName);
    if (rows) rows.push(row);
    else rowsByName.set(row.assetName, [row]);
  }
  const names = new Map<string, string[]>();
  const open: InvestmentBatch[] = [];
  for (const batch of batches.filter(isFixedIncome)) {
    const { investment } = batch;
    const name = nameByProvenance(investment, ledger);
    if (name) {
      names.set(investment.id, [name]);
    } else if (!rowsByName.get(keyOf(investment))?.some(isForeign)) {
      open.push(batch);
    }
  }

  // Only names nothing else identifies: typed by hand, or a Tesouro title.
  const taken = new Set([
    ...[...names.values()].flat(),
    ...batches.map(({ investment }) => keyOf(investment)),
  ]);
  const candidates = new Map<string, LedgerRow[]>();
  for (const [name, all] of rowsByName) {
    const rows = all.filter(isForeign);
    if (taken.has(name) || rows.length === 0) continue;
    if (rows.length !== all.filter((row) => !isPlug(row)).length) continue;
    const known = rows.every(
      (row) => row.isFixedIncome && (!row.sourceHash || row.tesouroTitle),
    );
    if (known) candidates.set(name, rows);
  }
  for (const batch of open)
    names.set(batch.investment.id, namesByContent(batch, candidates));

  // One to one or not at all: an ambiguous match would merge two holdings.
  const claims = new Map<string, number>();
  for (const list of names.values())
    for (const name of list) claims.set(name, (claims.get(name) ?? 0) + 1);
  const resolved = new Map<string, string>();
  for (const { investment } of batches) {
    const list = names.get(investment.id) ?? [];
    const [name] = list;
    if (list.length !== 1 || name === keyOf(investment)) continue;
    if (claims.get(name!) !== 1) continue;
    // Rows of the owner's own under the code are another asset's history.
    if (rowsByName.get(keyOf(investment))?.some(isForeign)) continue;
    resolved.set(investment.id, name!);
  }
  return resolved;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Fold the rows an earlier sync wrote under another name into `target`. A
 * movement `target` already records is dropped, as are snapshots and plugs
 * (the next reconciliation rebuilds whatever is really missing); anything
 * else moves over, so no movement is lost.
 */
async function foldInto(tx: Tx, rows: LedgerRow[], target: LedgerRow[]) {
  const name = target[0]!.assetName;
  const pool = target.filter((row) => !isPlug(row));
  for (const row of rows) {
    const drop =
      isPlug(row) ||
      bareHash(row).startsWith("pluggy:position:") ||
      takeMatch(pool, row) !== undefined;
    const where = eq(investmentTransactions.id, row.id);
    if (drop) await tx.delete(investmentTransactions).where(where);
    else
      await tx
        .update(investmentTransactions)
        .set({ assetName: name })
        .where(where);
  }
}

async function foldIncome(
  tx: Tx,
  userId: string,
  fromName: string,
  toName: string,
) {
  const accountIds = (
    await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.userId, userId))
  ).map((account) => account.id);
  const rows = await tx
    .select()
    .from(dividends)
    .where(
      and(
        inArray(dividends.investmentAccountId, accountIds),
        inArray(dividends.assetName, [fromName, toName]),
      ),
    );
  const pool = rows.filter((row) => row.assetName === toName);
  for (const row of rows) {
    if (row.assetName !== fromName || row.source !== "PLUGGY_IMPORT") continue;
    const match = pool.findIndex(
      (other) =>
        other.paymentDate.slice(0, 10) === row.paymentDate.slice(0, 10) &&
        Math.abs(other.amount - row.amount) <= CENTS_APART,
    );
    const where = eq(dividends.id, row.id);
    if (match >= 0) {
      pool.splice(match, 1);
      await tx.delete(dividends).where(where);
    } else {
      await tx.update(dividends).set({ assetName: toName }).where(where);
    }
  }
}

/**
 * Recognise the bank's holdings as the ledger assets they already are, and
 * merge away the copies earlier syncs made.
 *
 * Returns the batches with each holding under its ledger name, and
 * `alreadyHeld`, which says whether a row is one the ledger has from another
 * source: a movement recorded there, or a snapshot of a position it already
 * carries (reconciliation closes any gap in units).
 */
export async function identifyHoldings(
  userId: string,
  all: InvestmentBatch[],
): Promise<{
  batches: InvestmentBatch[];
  alreadyHeld: (row: PluggyInvestmentRow) => boolean;
}> {
  const { twins, kept } = splitTwins(all);
  const before = await loadLedger(userId);
  const resolved = resolveNames(kept, before);
  const nameOf = (investment: PluggyInvestment) =>
    resolved.get(investment.id) ?? keyOf(investment);

  await db.transaction(async (tx) => {
    for (const { investment } of kept) {
      const name = resolved.get(investment.id);
      if (!name) continue;
      const from = keyOf(investment);
      // A name without a code may be shared by holdings, so only this one's
      // own rows move; under a code every row is this holding.
      const copies = before.filter(
        (row) =>
          row.assetName === from &&
          (codeOf(investment) || pluggyIdOf(row) === investment.id),
      );
      const target = before.filter((row) => row.assetName === name);
      await foldInto(tx, copies, target);
      if (codeOf(investment)) await foldIncome(tx, userId, from, name);
    }
    for (const { twin, of } of twins) {
      const name = nameOf(of.investment);
      const copies = before.filter(
        (row) =>
          pluggyIdOf(row) === twin.investment.id && row.assetName !== name,
      );
      // Only the copies whose original is in the ledger too.
      const target = before.filter((row) => row.assetName === name);
      if (target.length > 0) await foldInto(tx, copies, target);
    }
  });

  const batches = kept.map((batch) => {
    const name = resolved.get(batch.investment.id);
    return name
      ? { ...batch, investment: { ...batch.investment, code: name, name } }
      : batch;
  });

  // What another source already recorded, matched one for one. A hand-typed
  // match takes the bank's id (and its unit count, so "1 × 2.000" agrees with
  // "2 × 1.000"): from then on the id says which holding it is, even after
  // the movement leaves the bank's history window or the asset is renamed.
  const held = new Set<string>();
  const ledger = await loadLedger(userId);
  const written = new Set(ledger.map((row) => row.sourceHash));
  for (const batch of batches.filter(isFixedIncome)) {
    const asset = ledger.filter(
      (row) => row.assetName === keyOf(batch.investment) && !isPlug(row),
    );
    const pool = asset.filter(isForeign);
    // Also once a movement synced long ago leaves the bank's window: the
    // snapshot offered in its place is of units the ledger already has.
    const carried = pool.length > 0 || covers(asset, batch.investment);
    for (const row of unitRows(batch)) {
      const hash = pluggyInvestmentSourceHash(row);
      const ownedHash = ownerHash(userId, hash);
      if (written.has(ownedHash)) continue;
      const match = takeMatch(pool, eventOf(row));
      if (match || (row.kind === "position" && carried)) held.add(hash);
      if (!match || match.sourceHash) continue;
      await db
        .update(investmentTransactions)
        .set({
          sourceHash: ownedHash,
          quantity: row.quantity,
          pricePerUnit: row.amount / row.quantity,
        })
        .where(eq(investmentTransactions.id, match.id));
    }
  }
  return {
    batches,
    alreadyHeld: (row) => held.has(pluggyInvestmentSourceHash(row)),
  };
}
