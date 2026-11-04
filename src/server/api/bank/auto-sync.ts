// Background upkeep, so the owner never has to press "sincronizar" or watch a
// refresh: Pluggy expenses and investments come in on their own, the ledger is
// settled against what the bank reports, and market data is kept warm so a
// page never opens on yesterday's quotes.
//
// Everything here reuses the importers the dialogs use — same dedup, same
// categorization — and only decides what the dialog would have asked.
import { and, eq, inArray, like, notInArray } from "drizzle-orm";

import { db } from "~/server/db";
import {
  accounts,
  bankAccountLinks,
  bankConnections,
  dismissedStatementRows,
  expenses,
  investmentTransactions,
  providerHoldings,
  user,
} from "~/server/db/schema";
import {
  previewStatementRows,
  importStatementRows,
} from "../expenses/statement-import";
import { investmentRepository } from "../investments/repository";
import {
  bankPosition,
  reconcileWithBank,
  type BankPosition,
} from "../investments/reconcile-actions";
import { isOpenFinanceOwner } from "./owner";
import {
  fetchConnectionInvestmentRows,
  fetchLinkedAccountRows,
  refreshConnections,
  refreshLinkedBalances,
} from "./sync";
import {
  createAssetType,
  importPluggyInvestmentRows,
  previewPluggyInvestmentRows,
} from "./investment-import";

/**
 * Short against the 15-minute quote TTL: a tick only fetches what expired,
 * so brapi sees each symbol about once per TTL either way, and a quote
 * outlives it by a few minutes at most before it is replaced.
 */
const TICK_MS = 5 * 60 * 1000;
/** Pluggy refreshes an item about once a day; a few reads a day catch it promptly. */
const BANK_SYNC_EVERY_MS = 6 * 60 * 60 * 1000;
/** Re-read a few days back: late-posting charges keep their original date. */
const OVERLAP_DAYS = 7;
const MAX_DAYS = 90;
/** A connection synced by hand this recently may still be under review. */
const MANUAL_GRACE_MS = 30 * 60 * 1000;
/** Where a charge or an asset goes when nothing names a better home. */
const FALLBACK_NAME = "Outros";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days back from today that reach `from`, within what Open Finance serves. */
function windowDays(from: Date, now = Date.now()): number {
  const days = Math.ceil((now - from.getTime()) / DAY_MS);
  return Math.min(MAX_DAYS, Math.max(1, days));
}

function expenseKey(date: string, amount: number): string {
  return `${date}|${amount.toFixed(2)}`;
}

/**
 * Day+amount -> how many imported expenses the account has that this fetch
 * did not write: every row of an earlier Pluggy sync is in the fetch under
 * its own hash, so whatever is left came from a statement file.
 */
async function foreignExpenseCounts(
  accountId: number,
  rows: Array<{
    row: { date: string };
    hash: string | null;
    status: string;
  }>,
): Promise<Map<string, number>> {
  const dates = [
    ...new Set(
      rows.filter((entry) => entry.status === "new").map((e) => e.row.date),
    ),
  ];
  const counts = new Map<string, number>();
  if (dates.length === 0) return counts;
  const fetched = new Set(rows.map((entry) => entry.hash).filter(Boolean));
  const existing = await db
    .select({
      date: expenses.expenseDate,
      amount: expenses.amount,
      sourceHash: expenses.sourceHash,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.checkingAccountId, accountId),
        eq(expenses.source, "IMPORT"),
        inArray(expenses.expenseDate, dates),
      ),
    );
  for (const row of existing) {
    if (row.sourceHash && fetched.has(row.sourceHash)) continue;
    const key = expenseKey(row.date.slice(0, 10), row.amount);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Only accounts the owner has already synced by hand are synced in the
 * background. The first run starts at that sync — before it, the owner has
 * reviewed the rows (and left some out on purpose, which older syncs did not
 * record) or brought the period in from a statement file. Later runs reach a
 * few days behind their own last success.
 */
async function syncExpenses(
  userId: string,
  link: typeof bankAccountLinks.$inferSelect,
) {
  const from = link.autoSyncFrom ?? link.lastSyncedAt;
  if (!from) return 0;
  // Pinned before the fetch, which moves `lastSyncedAt` on: a first run
  // that fails must not leave the next one starting later.
  if (!link.autoSyncFrom) {
    await db
      .update(bankAccountLinks)
      .set({ autoSyncFrom: from })
      .where(eq(bankAccountLinks.id, link.id));
  }
  const startedAt = Date.now();
  const fetched = await fetchLinkedAccountRows({
    userId,
    linkId: link.id,
    days: windowDays(from),
  });
  // The fetch is day-granular and reaches back further; nothing before
  // `from` was ever this job's to import.
  // In São Paulo time, the day statements are dated in: a manual sync at
  // 22h is already tomorrow in UTC, which would cut that whole day off.
  // Rows dated earlier and posted only after that first boundary are not
  // imported — the price of never re-importing what the owner left out
  // before skips were recorded; later runs overlap by a week.
  const fromDay = saoPauloDay(from);
  const rows = fetched.rows.filter((row) => row.date >= fromDay);
  const inserted = rows.length
    ? await importNewExpenses(
        userId,
        fetched.accountId,
        fetched.institution,
        rows,
      )
    : 0;
  // Never behind where it started: the first boundary is the last manual
  // sync, before which rows the owner left out were not yet recorded.
  const next = Math.max(startedAt - OVERLAP_DAYS * DAY_MS, from.getTime());
  await db
    .update(bankAccountLinks)
    .set({ autoSyncFrom: new Date(next) })
    .where(eq(bankAccountLinks.id, link.id));
  return inserted;
}

async function importNewExpenses(
  userId: string,
  accountId: number,
  institution: string,
  rows: Awaited<ReturnType<typeof fetchLinkedAccountRows>>["rows"],
) {
  const preview = await previewStatementRows(userId, rows, institution);
  const newHashes = preview.rows
    .filter((entry) => entry.status === "new" && entry.hash)
    .map((entry) => entry.hash!);
  if (newHashes.length === 0) return 0;
  // What the owner left out of a manual sync stays out.
  const dismissed = new Set(
    (
      await db
        .select({ sourceHash: dismissedStatementRows.sourceHash })
        .from(dismissedStatementRows)
        .where(inArray(dismissedStatementRows.sourceHash, newHashes))
    ).map((row) => row.sourceHash),
  );

  // What the dialog pre-fills, accepted as is: the learned or exact category,
  // else Pluggy's own label, else the fallback. A charge left out for want of
  // a category would make the account disagree with the bank.
  const categoryByHash: Record<string, number> = {};
  const pluggyCategoryHashes: string[] = [];
  const fallbackRows = new Set<number>();
  const alreadyRecorded = await foreignExpenseCounts(accountId, preview.rows);
  preview.rows.forEach((entry, index) => {
    if (entry.status !== "new" || !entry.hash || dismissed.has(entry.hash))
      return;
    // Already on the account from a statement file: its rows carry other
    // ids, so only the day and the amount can say it is the same charge.
    // Matched one for one, so a real second charge still comes in. Expenses
    // typed by hand are not matched — a cash purchase of the same amount is
    // a different expense, and dropping a bank charge silently is worse.
    const key = expenseKey(entry.row.date, entry.row.amount);
    const left = alreadyRecorded.get(key) ?? 0;
    if (left > 0) {
      alreadyRecorded.set(key, left - 1);
      return;
    }
    if (entry.suggestedCategoryId != null) {
      categoryByHash[entry.hash] = entry.suggestedCategoryId;
      return;
    }
    pluggyCategoryHashes.push(entry.hash);
    if (!entry.providerCategory) fallbackRows.add(index);
  });
  if (Object.keys(categoryByHash).length + pluggyCategoryHashes.length === 0)
    return 0;

  // Every row goes back, duplicates and ignored ones included, so the hashes
  // are computed over the same list the preview saw; only the mapped ones
  // are written.
  const { inserted } = await importStatementRows({
    userId,
    accountId,
    categoryByHash,
    pluggyCategoryHashes,
    ignoredHashes: [],
    rememberDismissed: false,
    rows: rows.map((row, index) =>
      fallbackRows.has(index)
        ? { ...row, providerCategory: FALLBACK_NAME }
        : row,
    ),
  });
  return inserted;
}

async function syncInvestments(
  userId: string,
  connectionId: number,
  investmentAccountId: number,
  fallbackType: () => Promise<number | undefined>,
) {
  const fetched = await fetchConnectionInvestmentRows({ userId, connectionId });
  // Opening positions only, and only for assets the ledger has never seen:
  // a "shortfall" position is measured against the connector's window, not
  // the ledger, and would double what earlier syncs already brought in.
  // `reconcileWithBank` closes any remaining gap against the ledger itself.
  const openings = fetched.positions.filter(
    (row) => row.kind === "position" && row.movementId === "opening",
  );
  const candidates = [...fetched.rows, ...openings];
  if (candidates.length === 0) return fetched.reportedAssets;
  const preview = await previewPluggyInvestmentRows(userId, candidates);

  const assetTypeByAsset: Record<string, number> = {};
  const pluggyTypeAssets = new Set<string>();
  const skippedOpenings = new Set<string>();
  for (const entry of preview) {
    const { row } = entry;
    if (entry.status !== "new" || row.kind === "income") continue;
    if (row.kind === "position" && entry.knownAssetTypeId != null) {
      skippedOpenings.add(row.assetName);
      continue;
    }
    if (entry.knownAssetTypeId != null) continue;
    if (assetTypeByAsset[row.assetName] || pluggyTypeAssets.has(row.assetName))
      continue;
    if (entry.providerAssetTypeId != null)
      assetTypeByAsset[row.assetName] = entry.providerAssetTypeId;
    else if (entry.providerAssetType) pluggyTypeAssets.add(row.assetName);
    else {
      const id = await fallbackType();
      if (id !== undefined) assetTypeByAsset[row.assetName] = id;
    }
  }

  await importPluggyInvestmentRows({
    userId,
    investmentAccountId,
    assetTypeByAsset,
    pluggyTypeAssets: [...pluggyTypeAssets],
    rows: candidates.filter(
      (row) => !(row.kind === "position" && skippedOpenings.has(row.assetName)),
    ),
  });
  return fetched.reportedAssets;
}

/** One owner's connections, then the ledger settled against them once. */
async function syncOwner(
  userId: string,
  connections: Array<typeof bankConnections.$inferSelect>,
) {
  let fallbackTypeId: Promise<number | undefined> | undefined;
  const fallbackType = () =>
    (fallbackTypeId ??= createAssetType(userId, FALLBACK_NAME));
  // Asset -> how many connections reported it on this run; and whether every
  // investment fetch came back, without which the set is not the whole story.
  const reportedBy = new Map<string, number>();
  const connectedAccounts = new Set<number>();
  // Investment accounts whose connection was skipped or failed this run:
  // what they hold is unknown, so nothing in them is settled.
  const unknownAccounts = new Set<number>();

  for (const connection of connections) {
    // Being reviewed in a sync dialog right now, or just was: importing under
    // the owner's feet would drop the choices they are about to confirm.
    if (
      connection.lastSyncedAt &&
      Date.now() - connection.lastSyncedAt.getTime() < MANUAL_GRACE_MS
    ) {
      if (connection.investmentAccountId != null)
        unknownAccounts.add(connection.investmentAccountId);
      continue;
    }
    try {
      await refreshLinkedBalances(userId, connection.id);
      const links = await db
        .select()
        .from(bankAccountLinks)
        .where(eq(bankAccountLinks.connectionId, connection.id));
      for (const link of links) await syncExpenses(userId, link);
    } catch (error) {
      console.error(`[auto-sync] connection ${connection.id} accounts`, error);
    }
    if (connection.investmentAccountId == null) continue;
    // Pluggy keeps serving an item's last figures after it stops updating
    // (expired consent, login error). Those are not today's holdings.
    if (connection.status !== "UPDATED") {
      unknownAccounts.add(connection.investmentAccountId);
      continue;
    }
    try {
      const reported = await syncInvestments(
        userId,
        connection.id,
        connection.investmentAccountId,
        fallbackType,
      );
      for (const asset of new Set(reported))
        reportedBy.set(asset, (reportedBy.get(asset) ?? 0) + 1);
      connectedAccounts.add(connection.investmentAccountId);
    } catch (error) {
      unknownAccounts.add(connection.investmentAccountId);
      console.error(
        `[auto-sync] connection ${connection.id} investments`,
        error,
      );
    }
  }

  const [homeAccount] = connectedAccounts;
  if (homeAccount === undefined) return;
  // Only with every connection's holdings in hand can the bank's silence be
  // read as "no longer held". Short of that, the healthy connections are
  // still settled — a consent that expired at one bank must not quietly stop
  // the others from agreeing with theirs.
  const complete = unknownAccounts.size === 0;
  const ledgerAccounts = async (asset: string) =>
    (await investmentRepository.findByAssetName(userId, asset)).map(
      (row) => row.investmentAccountId,
    );

  // What each stored figure now means. Reported by one connection: that
  // bank's position — unless the ledger keeps the asset in an account whose
  // connection is unknown this run. By two: it is stored once per asset, so
  // it holds whichever wrote last — neither's whole position; no plug stands
  // on it. By none, though reported before, on a complete run: redeemed —
  // provided the ledger keeps it only in connected accounts (a removed
  // connection's assets are the owner's history, not the bank's silence).
  const facts = await db
    .select()
    .from(providerHoldings)
    .where(eq(providerHoldings.userId, userId));
  // Assets carrying a plug: one closed by an earlier run has no figure left,
  // and must stay closed rather than have its plug dropped.
  const plugged = await db
    .selectDistinct({ assetName: investmentTransactions.assetName })
    .from(investmentTransactions)
    .innerJoin(
      accounts,
      eq(accounts.id, investmentTransactions.investmentAccountId),
    )
    .where(
      and(
        eq(accounts.userId, userId),
        like(investmentTransactions.sourceHash, `%:reconcile:%`),
      ),
    );
  const factByAsset = new Map(facts.map((fact) => [fact.assetName, fact]));
  const plan = new Map<string, BankPosition | null>();
  for (const asset of new Set([
    ...factByAsset.keys(),
    ...plugged.map((row) => row.assetName),
  ])) {
    const count = reportedBy.get(asset) ?? 0;
    const held = await ledgerAccounts(asset);
    if (count > 1) {
      plan.set(asset, null);
    } else if (count === 1) {
      const fact = factByAsset.get(asset);
      const position = fact && bankPosition(fact);
      if (position && !held.some((id) => unknownAccounts.has(id)))
        plan.set(asset, position);
    } else if (complete) {
      plan.set(
        asset,
        held.every((id) => connectedAccounts.has(id))
          ? {
              quantity: 0,
              unitPrice: null,
              unitCost: null,
              syncedAt: new Date(),
            }
          : null,
      );
    }
  }

  // Only figures one connection just reported stay: anything else would keep
  // marking a position at a value no single bank vouches for today. One the
  // bank went quiet about is only dropped once every connection answered.
  const shared = [...reportedBy]
    .filter(([, count]) => count > 1)
    .map(([asset]) => asset);
  const single = [...reportedBy]
    .filter(([, count]) => count === 1)
    .map(([asset]) => asset);
  if (shared.length > 0) {
    await db
      .delete(providerHoldings)
      .where(
        and(
          eq(providerHoldings.userId, userId),
          inArray(providerHoldings.assetName, shared),
        ),
      );
  }
  if (complete) {
    await db
      .delete(providerHoldings)
      .where(
        single.length > 0
          ? and(
              eq(providerHoldings.userId, userId),
              notInArray(providerHoldings.assetName, single),
            )
          : eq(providerHoldings.userId, userId),
      );
  }

  // After every connection, not after each: a gap closed against one
  // connection's fresh figures and another's stale ones would be booked twice.
  await reconcileWithBank(userId, plan, async () => {
    const assetTypeId = await fallbackType();
    return assetTypeId === undefined
      ? null
      : { investmentAccountId: homeAccount, assetTypeId };
  });
}

export async function syncAllBanks() {
  const rows = await db
    .selectDistinct({ userId: bankConnections.userId, email: user.email })
    .from(bankConnections)
    .innerJoin(user, eq(user.id, bankConnections.userId));
  // The licence boundary the bank procedures enforce applies here too.
  const owners = rows
    .filter((row) => isOpenFinanceOwner(row.email))
    .map((row) => row.userId);
  for (const userId of owners) {
    try {
      // Statuses first: they decide which connections' holdings count.
      await refreshConnections(userId);
      const connections = await db
        .select()
        .from(bankConnections)
        .where(eq(bankConnections.userId, userId));
      await syncOwner(userId, connections);
    } catch (error) {
      console.error(`[auto-sync] owner ${userId}`, error);
    }
  }
}

function saoPauloDay(date: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

/** Weekdays 10h–18h in São Paulo: outside the session quotes do not move. */
export function isB3Session(now = new Date()): boolean {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      weekday: "short",
      hour: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour);
  return !["Sat", "Sun"].includes(parts.weekday!) && hour >= 10 && hour < 18;
}

async function warmMarketData() {
  const owners = await db
    .selectDistinct({ userId: accounts.userId })
    .from(accounts)
    .where(eq(accounts.accountType, "INVESTMENT"));
  for (const { userId } of owners) {
    try {
      await investmentRepository.refreshMarketData(userId);
    } catch (error) {
      console.error(`[auto-sync] market data for ${userId}`, error);
    }
  }
}

/**
 * One process-local loop. A tick that is still running when the next one is
 * due is skipped rather than stacked.
 */
export function startAutoSync() {
  let running = false;
  let lastBankSync = 0;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const bankDue = Date.now() - lastBankSync >= BANK_SYNC_EVERY_MS;
      if (bankDue) {
        lastBankSync = Date.now();
        await syncAllBanks();
      }
      // ponytail: brapi quota is per request, so quotes are warmed only while
      // they move, plus after each bank sync (the first tick included).
      if (bankDue || isB3Session()) await warmMarketData();
    } catch (error) {
      console.error("[auto-sync]", error);
    } finally {
      running = false;
    }
  };
  setTimeout(() => void tick(), 60_000).unref();
  setInterval(() => void tick(), TICK_MS).unref();
}
