// Maps Pluggy's investment product into the app's transaction-ledger model.
// Holdings are intentionally not turned into synthetic purchases: a balance
// without movements is useful context, but inventing its acquisition date and
// price would corrupt the portfolio's historical return calculations.
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { chunk } from "~/lib/chunk";
import { db } from "~/server/db";
import {
  accounts,
  assetLabels,
  assetTypes,
  dividends,
  investmentTransactions,
  providerHoldings,
} from "~/server/db/schema";
import { isCnpj, normalizeCnpj } from "~/server/services/cvm-funds";
import type {
  PluggyInvestment,
  PluggyInvestmentTransaction,
} from "~/server/services/pluggy";
import {
  incomeMovementKey,
  loadForeignMovementKeys,
  tradeMovementKey,
} from "../investments/ledger-dedup";
import { assetTypeKey, pluggyAssetTypeLabel } from "./asset-type";
import { ownerHash } from "../owner-hash";

/** Rows per INSERT statement — see the note in `chunk`. */
const INSERT_CHUNK_SIZE = 200;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const pluggyInvestmentRowSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("trade"),
    investmentId: z.string().max(200).min(1),
    movementId: z.string().max(200).min(1),
    assetName: z.string().max(200).min(1),
    /** Readable name the provider reports, when the key is a code. */
    assetLabel: z.string().max(200).nullish(),
    /** Fund CNPJ (14 digits), when the holding is a fund share. */
    fundCnpj: z.string().max(200).nullish(),
    providerType: z.string().max(200).min(1),
    providerSubtype: z.string().max(200).nullish(),
    date: isoDate,
    side: z.enum(["BUY", "SELL"]),
    quantity: z.number().positive(),
    price: z.number().nonnegative(),
    amount: z.number().positive(),
    isFixedIncome: z.boolean(),
    fixedIncomeYieldType: z.enum(["CDI_PERCENTAGE", "PREFIXED"]).nullish(),
    fixedIncomeRate: z.number().positive().nullish(),
    fixedIncomeMaturityDate: isoDate.nullish(),
  }),
  /**
   * A holding Pluggy reports with no movement history at all, imported as the
   * single BUY that opened it. Only ever produced when the connector supplies a
   * real acquisition date and a real amount paid — never derived from today's
   * balance, which would invent a cost basis and corrupt every return figure
   * computed from it.
   */
  z.object({
    kind: z.literal("position"),
    investmentId: z.string().max(200).min(1),
    movementId: z.string().max(200).min(1),
    assetName: z.string().max(200).min(1),
    /** Readable name the provider reports, when the key is a code. */
    assetLabel: z.string().max(200).nullish(),
    /** Fund CNPJ (14 digits), when the holding is a fund share. */
    fundCnpj: z.string().max(200).nullish(),
    providerType: z.string().max(200).min(1),
    providerSubtype: z.string().max(200).nullish(),
    date: isoDate,
    quantity: z.number().positive(),
    price: z.number().nonnegative(),
    amount: z.number().positive(),
    isFixedIncome: z.boolean(),
    fixedIncomeYieldType: z.enum(["CDI_PERCENTAGE", "PREFIXED"]).nullish(),
    fixedIncomeRate: z.number().positive().nullish(),
    fixedIncomeMaturityDate: isoDate.nullish(),
  }),
  z.object({
    kind: z.literal("income"),
    investmentId: z.string().max(200).min(1),
    movementId: z.string().max(200).min(1),
    assetName: z.string().max(200).min(1),
    /** Readable name the provider reports, when the key is a code. */
    assetLabel: z.string().max(200).nullish(),
    /** Fund CNPJ (14 digits), when the holding is a fund share. */
    fundCnpj: z.string().max(200).nullish(),
    providerType: z.string().max(200).min(1),
    providerSubtype: z.string().max(200).nullish(),
    date: isoDate,
    amount: z.number().positive(),
  }),
]);

export type PluggyInvestmentRow = z.infer<typeof pluggyInvestmentRowSchema>;

/**
 * Rows that land in `investment_transactions` and therefore need an asset type.
 * Income goes to `dividends`, which has no type column at all.
 */
function needsAssetType(
  row: PluggyInvestmentRow,
): row is Extract<PluggyInvestmentRow, { kind: "trade" | "position" }> {
  return row.kind === "trade" || row.kind === "position";
}

export interface UnsupportedInvestmentRow {
  investmentId: string;
  assetName: string;
  movementType: "TAX" | "TRANSFER" | "AMORTIZATION";
}

/**
 * Movements left out for want of usable numbers, counted rather than discarded
 * quietly. A holding whose history is missing movements reads as a position
 * smaller than the one the bank actually holds, and with nothing reported the
 * only symptom is a quantity that looks wrong for no visible reason.
 */
export interface DroppedInvestmentMovements {
  /** A trade with neither a quantity nor a unit value to derive one from. */
  withoutQuantity: number;
  /** No usable trade date, or an amount of zero or less. */
  unusable: number;
}

/** A reported figure only counts when it is a real, positive number. */
function positive(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function day(value: string | null | undefined): string | null {
  const parsed = value?.slice(0, 10) ?? null;
  return parsed && /^\d{4}-\d{2}-\d{2}$/.test(parsed) ? parsed : null;
}

function assetName(investment: PluggyInvestment): string {
  const code = investment.code?.trim();
  if (code) return code;
  return investment.name.trim();
}

/**
 * The readable name, when the ledger key is not one.
 *
 * The key has to stay the provider's code — a CNPJ, an issuer code — because
 * names are not unique (two CDBs from the same bank are reported under one
 * name) and the price sources are keyed by code. So the name travels beside
 * it as a label, and is dropped when it would only repeat the key.
 */
function assetLabel(investment: PluggyInvestment): string | null {
  const name = investment.name.trim();
  if (!name || name === assetName(investment)) return null;
  return name;
}

/** The fund CNPJ a holding is a share of, when it is one. */
function fundCnpj(investment: PluggyInvestment): string | null {
  if (investment.type !== "MUTUAL_FUND") return null;
  // Pluggy reports a fund's CNPJ as its `code`; some connectors punctuate it.
  for (const candidate of [investment.code, investment.name]) {
    if (candidate && isCnpj(candidate)) return normalizeCnpj(candidate);
  }
  return null;
}

function movementId(
  investment: PluggyInvestment,
  movement: PluggyInvestmentTransaction,
): string {
  if (movement.id) return movement.id;
  // A few connectors omit a movement id. This deterministic fallback is still
  // scoped by the Pluggy investment, so it remains stable across syncs.
  return [
    investment.id,
    movement.type,
    movement.tradeDate || movement.date,
    movement.quantity,
    movement.value,
    movement.amount,
    movement.description?.trim() ?? "",
  ].join("|");
}

/**
 * The row as a ledger movement, for dedup against what other sources already
 * imported — a trade that also came in through a B3 report is the same event
 * with a different id. See ledger-dedup.ts.
 */
function pluggyMovementKey(row: PluggyInvestmentRow): string {
  if (row.kind === "income") {
    return incomeMovementKey({
      assetName: row.assetName,
      date: row.date,
      amount: row.amount,
    });
  }
  return tradeMovementKey({
    assetName: row.assetName,
    date: row.date,
    // An opening position is the buy that created the holding.
    side: row.kind === "position" ? "BUY" : row.side,
    quantity: row.quantity,
    amount: row.amount,
  });
}

export function pluggyInvestmentSourceHash(row: PluggyInvestmentRow): string {
  // Opening positions get their own namespace, so they are recognisable in the
  // ledger: if a connector later starts returning this holding's real
  // movements, the opening row is the one to delete.
  if (row.kind === "position") {
    // "opening" keeps the original, id-only spelling: those hashes are already
    // in ledgers and rewriting them would re-import every opening position.
    return row.movementId === "opening"
      ? `pluggy:position:${row.investmentId}`
      : `pluggy:position:${row.investmentId}:${row.movementId}`;
  }
  return `pluggy:investment:${row.investmentId}:${row.movementId}`;
}

/** The yield terms a holding implies, shared by movements and opening positions. */
/** A rate Pluggy actually filled in; zero and null both mean "unknown". */
function positiveRate(rate: number | null | undefined): number | null {
  return rate && rate > 0 ? rate : null;
}

function fixedIncomeYieldType(
  investment: PluggyInvestment,
): "CDI_PERCENTAGE" | "PREFIXED" | null {
  if (investment.rateType === "CDI") return "CDI_PERCENTAGE";
  return positiveRate(investment.fixedAnnualRate) === null ? null : "PREFIXED";
}

function fixedIncomeTerms(investment: PluggyInvestment) {
  const yieldType = fixedIncomeYieldType(investment);

  return {
    isFixedIncome: investment.type === "FIXED_INCOME",
    fixedIncomeYieldType: yieldType,
    fixedIncomeRate: positiveRate(
      yieldType === "CDI_PERCENTAGE"
        ? investment.rate
        : investment.fixedAnnualRate,
    ),
    fixedIncomeMaturityDate: day(investment.dueDate),
  };
}

/**
 * A holding with no movement history, as the buy that opened it — or null when
 * the connector did not supply enough to say what that buy was.
 *
 * The bar is deliberately high: an acquisition date (`issueDate`, or the
 * holding's own `date`), a quantity, and the amount originally paid. Today's
 * balance is *not* an acceptable substitute for `amountOriginal`, because using
 * it would silently record the position as having cost whatever it is worth
 * now — making every gain since acquisition disappear.
 */
export function normalizeOpeningPosition(
  investment: PluggyInvestment,
): PluggyInvestmentRow | null {
  const name = assetName(investment);
  const date = day(investment.issueDate) ?? day(investment.date);
  const quantity = investment.quantity;
  const amount = investment.amountOriginal;

  if (!name || !date) return null;
  if (!quantity || quantity <= 0) return null;
  if (!amount || amount <= 0) return null;

  return {
    kind: "position",
    investmentId: investment.id,
    // Constant: there is exactly one opening position per holding, and the
    // hash namespaces it by investment id anyway.
    movementId: "opening",
    assetName: name,
    assetLabel: assetLabel(investment),
    fundCnpj: fundCnpj(investment),
    providerType: investment.type,
    providerSubtype: investment.subtype,
    date,
    quantity,
    price: amount / quantity,
    amount,
    ...fixedIncomeTerms(investment),
  };
}

/**
 * What a holding's imported history fails to account for: the quantity the
 * provider says is held, minus the quantity its movements add up to.
 *
 * A connector serves movements from a fixed window — typically the last twelve
 * months. A holding bought before that window returns only its recent
 * movements, and those are a fraction of the position. Nothing in the importer
 * noticed: `normalizeOpeningPosition` covers a holding with *no* movements,
 * while one with a partial history was treated as complete and came out at a
 * fraction of its real size.
 */
export interface HoldingShortfall {
  investmentId: string;
  assetName: string;
  assetLabel: string | null;
  /** Quantity the provider reports as currently held. */
  reported: number;
  /** Quantity the movements in the returned window add up to. */
  covered: number;
  /** `reported - covered`, always positive here. */
  missing: number;
  /** Quota value the provider reports, when it reports one. */
  quotaValue: number | null;
}

/**
 * Quantities are floating point and a connector's own rounding differs from
 * ours, so a hair of disagreement is not a gap. Half a percent of the reported
 * position is well below anything a missing movement could hide in.
 */
const SHORTFALL_TOLERANCE = 0.005;

/**
 * The part of a holding its movements cannot explain, or null when they
 * explain it (or when the provider reported no quantity to compare against).
 *
 * Deliberately computed from the movements the provider returned rather than
 * from the ledger: the window is the same on every sync, so the answer does
 * not change according to what has already been imported.
 */
export function holdingShortfall(
  investment: PluggyInvestment,
  rows: PluggyInvestmentRow[],
): HoldingShortfall | null {
  const name = assetName(investment);
  const reported = investment.quantity;
  if (!name || !reported || reported <= 0) return null;

  const covered = rows.reduce((total, row) => {
    if (row.investmentId !== investment.id) return total;
    if (row.kind === "trade") {
      return total + (row.side === "BUY" ? row.quantity : -row.quantity);
    }
    if (row.kind === "position") return total + row.quantity;
    return total;
  }, 0);

  const missing = reported - covered;
  if (missing <= reported * SHORTFALL_TOLERANCE) return null;

  return {
    investmentId: investment.id,
    assetName: name,
    assetLabel: assetLabel(investment),
    reported,
    covered,
    missing,
    quotaValue:
      investment.value && investment.value > 0 ? investment.value : null,
  };
}

/** The day before `date`, as the boundary the window's history starts at. */
function previousDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

/**
 * The quotas a holding carried into the connector's history window, as the buy
 * that must have acquired them — or null when the provider did not report
 * enough to say what that buy cost.
 *
 * The cost is arithmetic on two reported numbers: `amountOriginal` is what the
 * institution says was applied to this holding in total, and the window's own
 * buys are the part of it we already import. What remains bought the missing
 * quotas. When that subtraction leaves nothing — a connector whose
 * `amountOriginal` covers only the recent applications, say — there is no
 * honest cost to state and the caller is left with the warning instead of a
 * fabricated position.
 *
 * The date is the acquisition date when the provider gives one; otherwise the
 * day before the earliest movement in the window, which is the latest day the
 * missing quotas can possibly have been bought.
 */
export function normalizeShortfallPosition(
  investment: PluggyInvestment,
  shortfall: HoldingShortfall,
  rows: PluggyInvestmentRow[],
): PluggyInvestmentRow | null {
  const applied = investment.amountOriginal;
  if (!applied || applied <= 0) return null;

  const own = rows.filter(
    (row) => row.investmentId === investment.id && row.kind === "trade",
  );
  const inWindow = own.reduce((total, row) => {
    if (row.kind !== "trade") return total;
    return row.side === "BUY" ? total + row.amount : total - row.amount;
  }, 0);
  const amount = applied - inWindow;
  if (amount <= 0) return null;

  const earliest = own
    .map((row) => row.date)
    .sort((a, b) => a.localeCompare(b))[0];
  const date =
    day(investment.issueDate) ?? (earliest ? previousDay(earliest) : null);
  if (!date) return null;

  return {
    kind: "position",
    investmentId: investment.id,
    // Its own id, so the ledger row is recognisable as the reconstructed part
    // of the holding rather than a movement the bank reported.
    movementId: "shortfall",
    assetName: shortfall.assetName,
    assetLabel: assetLabel(investment),
    fundCnpj: fundCnpj(investment),
    providerType: investment.type,
    providerSubtype: investment.subtype,
    date,
    quantity: shortfall.missing,
    price: amount / shortfall.missing,
    amount,
    ...fixedIncomeTerms(investment),
  };
}

/**
 * Quantity and unit price of a trade. The app requires a quantity. When the
 * provider omits it but reports what one unit was worth, the quantity is
 * arithmetic on two numbers it did report — the same derivation `price` has
 * always made in reverse, and the only alternative is dropping a real
 * application on the floor. With neither number there is nothing to compute
 * and the movement is left out (null) rather than fabricated.
 */
function tradeFigures(
  movement: PluggyInvestmentTransaction,
  amount: number,
): { quantity: number; price: number } | null {
  const unitValue = positive(movement.value);
  const quantity = positive(movement.quantity);
  if (quantity) return { quantity, price: unitValue ?? amount / quantity };
  if (unitValue) return { quantity: amount / unitValue, price: unitValue };
  return null;
}

export function normalizeInvestmentMovements(
  investment: PluggyInvestment,
  movements: PluggyInvestmentTransaction[],
): {
  rows: PluggyInvestmentRow[];
  unsupported: UnsupportedInvestmentRow[];
  dropped: DroppedInvestmentMovements;
} {
  const rows: PluggyInvestmentRow[] = [];
  const unsupported: UnsupportedInvestmentRow[] = [];
  const dropped: DroppedInvestmentMovements = {
    withoutQuantity: 0,
    unusable: 0,
  };
  const name = assetName(investment);
  // A holding with no usable name has nothing its movements could attach to.
  if (!name) return { rows, unsupported, dropped };
  const label = assetLabel(investment);
  const cnpj = fundCnpj(investment);
  const terms = fixedIncomeTerms(investment);

  for (const movement of movements) {
    const date = day(movement.tradeDate) ?? day(movement.date);
    const amount = positive(movement.amount);
    if (!date || amount === null) {
      dropped.unusable++;
      continue;
    }
    const base = {
      investmentId: investment.id,
      movementId: movementId(investment, movement),
      assetName: name,
      assetLabel: label,
      fundCnpj: cnpj,
      providerType: investment.type,
      providerSubtype: investment.subtype,
      date,
    };

    if (movement.type === "BUY" || movement.type === "SELL") {
      const figures = tradeFigures(movement, amount);
      if (!figures) {
        dropped.withoutQuantity++;
        continue;
      }
      rows.push({
        kind: "trade",
        ...base,
        side: movement.type,
        ...figures,
        amount,
        ...terms,
      });
    } else if (movement.type === "INTEREST") {
      rows.push({ kind: "income", ...base, amount });
    } else {
      unsupported.push({
        investmentId: investment.id,
        assetName: name,
        movementType: movement.type,
      });
    }
  }

  return { rows, unsupported, dropped };
}

/**
 * Record what the provider knows about each holding that the ledger cannot:
 * its readable name, its fund CNPJ, and the quota value it reports.
 *
 * Written at sync time rather than at import time, and for every holding the
 * provider returned — including ones whose movements are all duplicates, which
 * never reach the importer at all. None of it is ledger data: labels are
 * display, the CNPJ and quota are pricing keys, and re-syncing is the only way
 * a holding imported before this existed can acquire them.
 */
export async function recordProviderAssetFacts(
  userId: string,
  investments: PluggyInvestment[],
): Promise<void> {
  const facts = new Map<
    string,
    {
      label: string | null;
      cnpj: string | null;
      quota: number | null;
      quotaDate: string | null;
      quantity: number | null;
      value: number | null;
      applied: number | null;
      profit: number | null;
    }
  >();

  for (const investment of investments) {
    const name = assetName(investment);
    if (!name) continue;
    const quota = investment.value;
    facts.set(name, {
      label: assetLabel(investment),
      cnpj: fundCnpj(investment),
      quota: quota && quota > 0 ? quota : null,
      quotaDate: day(investment.date),
      quantity: positive(investment.quantity),
      // `balance` is the position's current worth; `amount` is the same figure
      // on the connectors that leave `balance` at zero.
      value: positive(investment.balance) ?? positive(investment.amount),
      applied: positive(investment.amountOriginal),
      // The only one that may legitimately be negative: a position under water.
      profit:
        typeof investment.amountProfit === "number" &&
        Number.isFinite(investment.amountProfit)
          ? investment.amountProfit
          : null,
    });
  }
  if (facts.size === 0) return;

  // Every holding, not only the ones with a readable label: this is the
  // independent record the ledger gets checked against, and a ticker needs
  // checking as much as a fund does.
  await db
    .insert(providerHoldings)
    .values(
      [...facts.entries()].map(([name, fact]) => ({
        userId,
        assetName: name,
        quantity: fact.quantity,
        value: fact.value,
        applied: fact.applied,
        profit: fact.profit,
        syncedAt: new Date(),
      })),
    )
    .onConflictDoUpdate({
      target: [providerHoldings.userId, providerHoldings.assetName],
      set: {
        quantity: sql`excluded.quantity`,
        value: sql`excluded.value`,
        applied: sql`excluded.applied`,
        profit: sql`excluded.profit`,
        syncedAt: new Date(),
      },
    });

  const labelled = [...facts.entries()].filter(([, fact]) => fact.label);
  if (labelled.length > 0) {
    await db
      .insert(assetLabels)
      .values(
        labelled.map(([name, fact]) => ({
          userId,
          assetName: name,
          label: fact.label!,
          source: "PLUGGY_IMPORT" as const,
          providerQuota: fact.quota,
          providerQuotaDate: fact.quotaDate,
          updatedAt: new Date(),
        })),
      )
      .onConflictDoUpdate({
        target: [assetLabels.userId, assetLabels.assetName],
        set: {
          label: sql`excluded.label`,
          providerQuota: sql`excluded.provider_quota`,
          providerQuotaDate: sql`excluded.provider_quota_date`,
          updatedAt: new Date(),
        },
      });
  }

  // Backfill the pricing key onto rows imported before it was collected. Only
  // ever fills a null: an asset that already carries a CNPJ keeps it.
  const funds = [...facts.entries()].filter(([, fact]) => fact.cnpj);
  if (funds.length === 0) return;
  const accountIds = (
    await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.userId, userId))
  ).map((account) => account.id);
  if (accountIds.length === 0) return;

  // One statement for every fund rather than one per fund: the CNPJ each row
  // gets is chosen by a CASE on its asset name. Runs on every sync, and after
  // the first one there is nothing left to fill — so the cost is one no-op
  // UPDATE instead of one per fund held.
  const cnpjByName = sql.join(
    funds.map(
      ([name, fact]) =>
        sql`WHEN ${investmentTransactions.assetName} = ${name} THEN ${fact.cnpj}`,
    ),
    sql` `,
  );
  await db
    .update(investmentTransactions)
    .set({ fundCnpj: sql`CASE ${cnpjByName} END` })
    .where(
      and(
        inArray(investmentTransactions.investmentAccountId, accountIds),
        inArray(
          investmentTransactions.assetName,
          funds.map(([name]) => name),
        ),
        isNull(investmentTransactions.fundCnpj),
      ),
    );
}

async function userTransactions(userId: string) {
  return await db
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
}

export async function previewPluggyInvestmentRows(
  userId: string,
  rows: PluggyInvestmentRow[],
) {
  const hashes = rows.map((row) =>
    ownerHash(userId, pluggyInvestmentSourceHash(row)),
  );
  const [
    existingTransactions,
    existingDividends,
    transactions,
    localTypes,
    ledgerKeys,
  ] = await Promise.all([
    hashes.length
      ? db
          .select({ sourceHash: investmentTransactions.sourceHash })
          .from(investmentTransactions)
          .where(inArray(investmentTransactions.sourceHash, hashes))
      : Promise.resolve([]),
    hashes.length
      ? db
          .select({ sourceHash: dividends.sourceHash })
          .from(dividends)
          .where(inArray(dividends.sourceHash, hashes))
      : Promise.resolve([]),
    userTransactions(userId),
    db
      .select({ id: assetTypes.id, name: assetTypes.name })
      .from(assetTypes)
      .where(eq(assetTypes.userId, userId)),
    loadForeignMovementKeys(
      userId,
      rows.map((row) => row.assetName),
      "PLUGGY",
    ),
  ]);
  const known = new Set(
    [...existingTransactions, ...existingDividends]
      .map((entry) => entry.sourceHash)
      .filter((hash): hash is string => !!hash),
  );
  const knownTypes = new Map(
    transactions.map((transaction) => [
      transaction.assetName,
      transaction.assetTypeId,
    ]),
  );
  // Asset types the user already keeps, keyed loosely enough that Pluggy's
  // "FIIs" lands on a hand-typed "FII's" instead of creating a twin.
  const typeIdByKey = new Map(
    localTypes.map((type) => [assetTypeKey(type.name), type.id]),
  );
  const seen = new Set<string>();

  return rows.map((row) => {
    const hash = ownerHash(userId, pluggyInvestmentSourceHash(row));
    // Already in the ledger under another source's hash — typically the same
    // trade imported from a B3 report before the connection existed.
    const imported = ledgerKeys.has(pluggyMovementKey(row));
    const duplicate = known.has(hash) || seen.has(hash) || imported;
    seen.add(hash);
    // Only trades carry an asset type; income lands in `dividends`, which has
    // no type column at all.
    const providerAssetType = needsAssetType(row)
      ? pluggyAssetTypeLabel(row.providerType, row.providerSubtype)
      : null;
    return {
      row,
      hash,
      status: duplicate ? ("duplicate" as const) : ("new" as const),
      /** True when the duplicate came from another source, not from a past sync. */
      importedElsewhere: imported && !known.has(hash),
      knownAssetTypeId: needsAssetType(row)
        ? (knownTypes.get(row.assetName) ?? null)
        : null,
      /** Type name Pluggy's classification implies, null when it implies none. */
      providerAssetType,
      /** That name resolved to an existing local type, when one matches. */
      providerAssetTypeId: providerAssetType
        ? (typeIdByKey.get(assetTypeKey(providerAssetType)) ?? null)
        : null,
    };
  });
}

/**
 * Asset name → Pluggy type label, for the assets in `accepted` that need a
 * type. First row per asset wins.
 */
function acceptedTypeLabels(
  rows: PluggyInvestmentRow[],
  accepted: Set<string>,
): Map<string, string> {
  const labelByAsset = new Map<string, string>();
  for (const row of rows) {
    if (!needsAssetType(row)) continue;
    if (!accepted.has(row.assetName) || labelByAsset.has(row.assetName))
      continue;
    const label = pluggyAssetTypeLabel(row.providerType, row.providerSubtype);
    if (label) labelByAsset.set(row.assetName, label);
  }
  return labelByAsset;
}

/** Create the asset type `label` for the user and return its id. */
async function createAssetType(
  userId: string,
  label: string,
): Promise<number | undefined> {
  const [created] = await db
    .insert(assetTypes)
    .values({
      userId,
      name: label,
      description: "Criado na sincronização Pluggy",
    })
    .onConflictDoNothing({
      target: [assetTypes.userId, assetTypes.name],
    })
    .returning({ id: assetTypes.id });
  if (created) return created.id;
  // onConflictDoNothing returns nothing when the name was taken between
  // the caller's read and this insert; re-read rather than dropping the row.
  const [existing] = await db
    .select({ id: assetTypes.id })
    .from(assetTypes)
    .where(and(eq(assetTypes.userId, userId), eq(assetTypes.name, label)));
  return existing?.id;
}

/**
 * Asset name → local asset type id, for the assets whose type the user took
 * from Pluggy. Types that do not exist yet are created here, once per name,
 * exactly as the statement importer creates a category the user accepted from
 * Pluggy — the ledger has no free-text type column to fall back on.
 */
async function resolveAcceptedPluggyTypes(
  userId: string,
  rows: PluggyInvestmentRow[],
  acceptedAssets: string[],
): Promise<Map<string, number>> {
  const labelByAsset = acceptedTypeLabels(rows, new Set(acceptedAssets));
  const resolved = new Map<string, number>();
  if (labelByAsset.size === 0) return resolved;

  const typeIdByKey = new Map(
    (
      await db
        .select({ id: assetTypes.id, name: assetTypes.name })
        .from(assetTypes)
        .where(eq(assetTypes.userId, userId))
    ).map((type) => [assetTypeKey(type.name), type.id] as const),
  );

  for (const [asset, label] of labelByAsset) {
    const key = assetTypeKey(label);
    let id = typeIdByKey.get(key);
    if (id === undefined) {
      id = await createAssetType(userId, label);
      if (id !== undefined) typeIdByKey.set(key, id);
    }
    if (id !== undefined) resolved.set(asset, id);
  }

  return resolved;
}

export async function importPluggyInvestmentRows(input: {
  userId: string;
  investmentAccountId: number;
  assetTypeByAsset: Record<string, number>;
  /** Assets whose type the user accepted from Pluggy instead of choosing one. */
  pluggyTypeAssets: string[];
  rows: PluggyInvestmentRow[];
}) {
  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.id, input.investmentAccountId),
        eq(accounts.userId, input.userId),
        eq(accounts.accountType, "INVESTMENT"),
      ),
    );
  if (!account) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Conta de investimento inválida",
    });
  }

  const knownTypes = new Map(
    (await userTransactions(input.userId)).map((transaction) => [
      transaction.assetName,
      transaction.assetTypeId,
    ]),
  );
  const pluggyTypeIdByAsset = await resolveAcceptedPluggyTypes(
    input.userId,
    input.rows,
    input.pluggyTypeAssets,
  );
  // Movements another source already imported, loaded once before anything is
  // written. Rows of this batch never dedup against each other by content:
  // their provider ids already tell two identical buys apart.
  const ledgerKeys = await loadForeignMovementKeys(
    input.userId,
    input.rows.map((row) => row.assetName),
    "PLUGGY",
  );

  let inserted = 0;
  let skipped = 0;
  const seen = new Set<string>();

  // Shaped first, written in batches — same reason as the other two
  // importers: a sync of a full brokerage history was one round trip per
  // movement.
  const tradeValues: Array<typeof investmentTransactions.$inferInsert> = [];
  const incomeValues: Array<typeof dividends.$inferInsert> = [];

  for (const row of input.rows) {
    const sourceHash = ownerHash(input.userId, pluggyInvestmentSourceHash(row));
    if (seen.has(sourceHash) || ledgerKeys.has(pluggyMovementKey(row))) {
      skipped++;
      continue;
    }
    seen.add(sourceHash);

    if (needsAssetType(row)) {
      // An explicit choice wins; then the type accepted from Pluggy for this
      // sync; only then the type this asset happened to carry historically.
      const assetTypeId =
        input.assetTypeByAsset[row.assetName] ??
        pluggyTypeIdByAsset.get(row.assetName) ??
        knownTypes.get(row.assetName);
      if (!assetTypeId) {
        skipped++;
        continue;
      }
      tradeValues.push({
        investmentAccountId: input.investmentAccountId,
        assetTypeId,
        assetName: row.assetName,
        // An opening position is the buy that created the holding.
        transactionType: row.kind === "position" ? "BUY" : row.side,
        quantity: row.quantity,
        pricePerUnit: row.price,
        totalAmount: row.amount,
        transactionDate: row.date,
        isFixedIncome: row.isFixedIncome,
        fixedIncomeYieldType: row.fixedIncomeYieldType ?? null,
        fixedIncomeRate: row.fixedIncomeRate ?? null,
        fixedIncomeMaturityDate: row.fixedIncomeMaturityDate ?? null,
        fundCnpj: row.fundCnpj ?? null,
        sourceHash,
      });
    } else {
      incomeValues.push({
        investmentAccountId: input.investmentAccountId,
        assetName: row.assetName,
        type: "RENDIMENTO",
        amount: row.amount,
        paymentDate: row.date,
        source: "PLUGGY_IMPORT",
        sourceHash,
      });
    }
  }

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
          if (writtenHashes.has(value.sourceHash!)) inserted++;
          else skipped++;
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
          if (writtenHashes.has(value.sourceHash!)) inserted++;
          else skipped++;
        }
      }
    });
  }

  return { inserted, skipped };
}
