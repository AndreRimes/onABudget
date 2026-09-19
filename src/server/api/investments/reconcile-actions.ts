// What happens when the owner settles a disagreement between the ledger and
// the bank — the one place the reconciliation is allowed to change things.
//
// "Keep onABudget" records that the difference was seen and is fine, against
// the bank's figures of the moment. "Accept the bank" does whatever makes the
// ledger agree, and that depends on why they disagree: a quantity gap is a
// trade the ledger is missing, a price gap is a valuation choice, a gain gap
// is a cost the ledger got wrong. The figures are always recomputed here from
// the ledger and the stored bank facts — the client only names the asset and
// the choice.
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

import { db } from "~/server/db";
import {
  investmentTransactions,
  providerHoldings,
  reconciliationDecisions,
} from "~/server/db/schema";
import { todayIso } from "~/server/services/market-cache";
import { ownerHash } from "../owner-hash";
import {
  investmentRepository,
  type InvestmentTransaction,
  type InvestmentTransactionInsert,
} from "./repository";
import type { ReconciliationCause, ReconciliationEntry } from "./reconcile";
import type { SnapshotHolding } from "./portfolio-engine";

export type ReconciliationChoice = "app" | "bank";

export type ReconciliationOutcome =
  | { action: "kept" }
  | {
      action: "adjusted";
      side: "BUY" | "SELL";
      quantity: number;
      totalAmount: number;
      date: string;
    }
  | { action: "price_pinned"; price: number }
  | { action: "cost_rescaled"; factor: number; targetCost: number };

export interface ResolveReconciliationInput {
  userId: string;
  assetName: string;
  choice: ReconciliationChoice;
  /** Only read for an asset the ledger has no row for: the trade needs a home. */
  assetTypeId?: number;
  investmentAccountId?: number;
}

/** The bank's row for one asset, `applied` included — the fact plus its cost. */
interface StoredFact {
  quantity: number | null;
  value: number | null;
  applied: number | null;
  profit: number | null;
  syncedAt: Date | null;
}

async function storedFact(
  userId: string,
  assetName: string,
): Promise<StoredFact | undefined> {
  const [fact] = await db
    .select({
      quantity: providerHoldings.quantity,
      value: providerHoldings.value,
      applied: providerHoldings.applied,
      profit: providerHoldings.profit,
      syncedAt: providerHoldings.syncedAt,
    })
    .from(providerHoldings)
    .where(
      and(
        eq(providerHoldings.userId, userId),
        eq(providerHoldings.assetName, assetName),
      ),
    );
  return fact;
}

/** The day before `date` — the latest day a missing buy can have happened. */
function previousDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function precondition(message: string): TRPCError {
  return new TRPCError({ code: "PRECONDITION_FAILED", message });
}

async function upsertDecision(
  input: ResolveReconciliationInput,
  decision: "app" | "bank_price",
  cause: ReconciliationCause,
  fact: StoredFact,
): Promise<void> {
  const values = {
    decision,
    cause,
    providerQuantity: fact.quantity,
    providerValue: fact.value,
    providerProfit: fact.profit,
    decidedAt: new Date(),
  };
  await db
    .insert(reconciliationDecisions)
    .values({ userId: input.userId, assetName: input.assetName, ...values })
    .onConflictDoUpdate({
      target: [
        reconciliationDecisions.userId,
        reconciliationDecisions.assetName,
      ],
      set: values,
    });
}

async function deleteDecision(userId: string, assetName: string) {
  await db
    .delete(reconciliationDecisions)
    .where(
      and(
        eq(reconciliationDecisions.userId, userId),
        eq(reconciliationDecisions.assetName, assetName),
      ),
    );
}

/**
 * The trade that closes a quantity gap. Missing units are a buy the ledger
 * never saw; surplus units are a sell it never saw.
 *
 * A buy's cost follows the same arithmetic as the sync's shortfall position:
 * what the bank says was applied in total, less what the ledger already
 * accounts for, is what bought the missing units. When the bank gives no
 * usable applied figure the units are costed at the bank's current unit
 * price — a position with no gain of its own, which is at least honest about
 * not knowing. The buy is dated the day before the ledger's first trade in the
 * asset (the latest day it could have happened), or the sync day when the
 * ledger has nothing; a sell is dated today, since it cannot predate what it
 * sells.
 */
async function adjustQuantity(
  input: ResolveReconciliationInput,
  entry: ReconciliationEntry,
  holding: SnapshotHolding | undefined,
  fact: StoredFact,
): Promise<ReconciliationOutcome> {
  if (!fact.quantity || fact.quantity <= 0 || !fact.value || !fact.syncedAt) {
    throw precondition("O banco não informou quantidade para este ativo");
  }
  const missing = fact.quantity - entry.appQuantity;
  const unitPrice = fact.value / fact.quantity;

  const history = await investmentRepository.findByAssetName(
    input.userId,
    input.assetName,
  );
  const template = await tradeTemplate(input, history);

  let side: "BUY" | "SELL";
  let quantity: number;
  let totalAmount: number;
  let date: string;
  if (missing > 0) {
    side = "BUY";
    quantity = missing;
    const ledgerCost = holding?.totalCost ?? 0;
    const fromApplied =
      fact.applied && fact.applied > ledgerCost
        ? fact.applied - ledgerCost
        : null;
    totalAmount = fromApplied ?? missing * unitPrice;
    const earliest = history
      .map((tx) => tx.transactionDate.slice(0, 10))
      .sort((a, b) => a.localeCompare(b))[0];
    date = earliest ? previousDay(earliest) : isoDay(fact.syncedAt);
  } else {
    side = "SELL";
    quantity = -missing;
    totalAmount = quantity * unitPrice;
    date = todayIso();
  }

  // Keyed on the sync it answers: resolving the same finding twice — a retry,
  // a second look before the next sync — must not book the trade twice.
  const sourceHash = ownerHash(
    input.userId,
    `reconcile:${input.assetName}:${fact.syncedAt.getTime()}`,
  );
  await db
    .insert(investmentTransactions)
    .values({
      ...template,
      assetName: input.assetName,
      transactionType: side,
      quantity,
      pricePerUnit: totalAmount / quantity,
      totalAmount,
      transactionDate: date,
      sourceHash,
    })
    .onConflictDoNothing({ target: investmentTransactions.sourceHash });

  // The ledger now says what the bank says; an earlier "keep" is moot.
  await deleteDecision(input.userId, input.assetName);

  return { action: "adjusted", side, quantity, totalAmount, date };
}

/**
 * Where the adjusting trade goes and what it looks like: the asset's own most
 * recent row when it has one (same account, type and fixed-income terms), or
 * the account and type the caller chose for an asset the ledger never saw.
 */
async function tradeTemplate(
  input: ResolveReconciliationInput,
  history: InvestmentTransaction[],
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
  if (input.assetTypeId == null || input.investmentAccountId == null) {
    throw precondition("Escolha o tipo e a conta do ativo");
  }
  return {
    investmentAccountId: input.investmentAccountId,
    assetTypeId: input.assetTypeId,
    isFixedIncome: false,
  };
}

/** The bank's cost basis as implied by its value less its profit. */
function providerCost(entry: ReconciliationEntry): number | null {
  if (entry.providerValue === null || entry.providerGain === null) return null;
  return entry.providerValue - entry.providerGain;
}

/**
 * Rewrite the buys so the position costs what the bank says it cost. The
 * bank's cost is what it reports as applied, or failing that its value less
 * its profit — the same figure from the other side.
 */
async function rescaleCost(
  input: ResolveReconciliationInput,
  entry: ReconciliationEntry,
  holding: SnapshotHolding | undefined,
  fact: StoredFact,
): Promise<ReconciliationOutcome> {
  const targetCost =
    fact.applied && fact.applied > 0 ? fact.applied : providerCost(entry);
  const ledgerCost = holding?.totalCost ?? 0;
  if (targetCost === null || targetCost <= 0) {
    throw precondition("O banco não informou o custo deste ativo");
  }
  if (ledgerCost <= 0) {
    throw precondition("Não há compras registradas para ajustar");
  }
  const factor = targetCost / ledgerCost;
  await investmentRepository.rescaleBuyCostByAssetName(
    input.userId,
    input.assetName,
    factor,
  );
  await deleteDecision(input.userId, input.assetName);
  return { action: "cost_rescaled", factor, targetCost };
}

export async function resolveReconciliation(
  input: ResolveReconciliationInput,
): Promise<ReconciliationOutcome> {
  // The bank facts are read for every asset regardless of the narrowing, so
  // the entry is there even when the ledger has no row for the asset.
  const snapshot = await investmentRepository.getPortfolioSnapshot(
    input.userId,
    "max",
    false,
    input.assetName,
  );
  const entry = snapshot.reconciliation.entries.find(
    (candidate) => candidate.assetName === input.assetName,
  );
  if (!entry) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Ativo não encontrado na conferência",
    });
  }
  if (
    entry.cause === "match" ||
    entry.cause === "unreported" ||
    entry.cause === "accepted"
  ) {
    throw precondition("Este ativo não tem divergência a resolver");
  }
  const fact = await storedFact(input.userId, input.assetName);
  if (!fact) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "O banco não informou este ativo",
    });
  }
  const holding = snapshot.holdings.find(
    (candidate) => candidate.assetName === input.assetName,
  );

  if (input.choice === "app") {
    await upsertDecision(input, "app", entry.cause, fact);
    return { action: "kept" };
  }

  switch (entry.cause) {
    case "quantity":
      return await adjustQuantity(input, entry, holding, fact);
    case "price": {
      if (holding?.isFixedIncome && !holding.tesouroTitle) {
        throw precondition(
          "Renda fixa com rendimento calculado não usa cotação; ajuste a taxa do ativo",
        );
      }
      if (!fact.quantity || fact.quantity <= 0 || fact.value == null) {
        throw precondition("O banco não informou preço para este ativo");
      }
      await upsertDecision(input, "bank_price", entry.cause, fact);
      return { action: "price_pinned", price: fact.value / fact.quantity };
    }
    case "gain":
      return await rescaleCost(input, entry, holding, fact);
  }
}

export async function undoReconciliationDecision(
  userId: string,
  assetName: string,
): Promise<void> {
  await deleteDecision(userId, assetName);
}
