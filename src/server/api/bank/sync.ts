// Open Finance sync: turns Pluggy data into the same normalized rows the OFX
// importer produces, so bank transactions ride the existing import pipeline
// (dedup by source_hash, category learning, preview → confirm) instead of a
// parallel one.
//
// Nothing here writes to `expenses`. It stops at producing rows; the user
// confirms them in StatementPreviewPanel, which commits through
// expenses.importStatement exactly as a file import does.
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "~/server/db";
import {
  accounts,
  bankAccountLinks,
  bankConnections,
} from "~/server/db/schema";
import {
  getItem,
  listAccounts,
  listInvestmentTransactions,
  listInvestments,
  listTransactions,
  type PluggyAccount,
} from "~/server/services/pluggy";
import { matchAccountId } from "../accounts/match";
import { recordBalanceSnapshots } from "../accounts/net-worth";
import { accountRepository } from "../accounts/repository";
import type { StatementRow } from "../expenses/statement-import";
import {
  holdingShortfall,
  normalizeInvestmentMovements,
  normalizeOpeningPosition,
  normalizeShortfallPosition,
  recordProviderAssetFacts,
  type HoldingShortfall,
  type PluggyInvestmentRow,
} from "./investment-import";
import { toStatementRow } from "./map-transaction";

/** How far back a sync reaches by default. Pluggy keeps ~12 months. */
export const DEFAULT_SYNC_DAYS = 90;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Record a connection the owner just authorised.
 *
 * The item id comes from the Connect widget (or is pasted from the Pluggy
 * dashboard). It cannot be discovered: the free tier refuses `GET /items`, so
 * an id learned once at consent time is the only handle we ever get.
 */
export async function addConnection(userId: string, itemId: string) {
  const item = await getItem(itemId);
  if (!item)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Conexão não encontrada no Pluggy",
    });

  await db
    .insert(bankConnections)
    .values({
      userId,
      provider: "pluggy",
      itemId: item.id,
      connectorName: item.connector?.name ?? "Instituição",
      status: item.status,
      consentExpiresAt: item.consentExpiresAt ?? null,
    })
    .onConflictDoUpdate({
      target: bankConnections.itemId,
      set: {
        userId,
        connectorName: item.connector?.name ?? "Instituição",
        status: item.status,
        consentExpiresAt: item.consentExpiresAt ?? null,
      },
    });

  return listConnections(userId);
}

/**
 * Re-read the status of every stored connection, one by one.
 *
 * A consent revoked at meu.pluggy.ai returns 404, which is recorded as a
 * status rather than thrown: the row stays so the UI can say the connection
 * needs renewing instead of silently losing it.
 */
export async function refreshConnections(userId: string) {
  const stored = await db
    .select()
    .from(bankConnections)
    .where(eq(bankConnections.userId, userId));

  // The provider calls go out together: each is a network round trip, and
  // waiting for one bank before asking the next made the page as slow as the
  // sum of them.
  const items = await Promise.all(
    stored.map((connection) => getItem(connection.itemId)),
  );

  for (const [index, connection] of stored.entries()) {
    const item = items[index];
    await db
      .update(bankConnections)
      .set(
        item
          ? {
              connectorName: item.connector?.name ?? connection.connectorName,
              status: item.status,
              consentExpiresAt: item.consentExpiresAt ?? null,
            }
          : { status: "NOT_FOUND" },
      )
      .where(eq(bankConnections.id, connection.id));
  }

  return listConnections(userId);
}

/** Locally known connections, each with the accounts already linked to it. */
export async function listConnections(userId: string) {
  const connections = await db
    .select()
    .from(bankConnections)
    .where(eq(bankConnections.userId, userId));

  if (connections.length === 0) return [];

  const links = await db
    .select()
    .from(bankAccountLinks)
    .where(
      inArray(
        bankAccountLinks.connectionId,
        connections.map((connection) => connection.id),
      ),
    );

  return connections.map((connection) => ({
    ...connection,
    links: links.filter((link) => link.connectionId === connection.id),
  }));
}

export async function requireConnection(userId: string, connectionId: number) {
  const [connection] = await db
    .select()
    .from(bankConnections)
    .where(
      and(
        eq(bankConnections.id, connectionId),
        eq(bankConnections.userId, userId),
      ),
    );

  if (!connection)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Conexão não encontrada",
    });
  return connection;
}

/**
 * Forget a connection.
 *
 * Only the provider-side bookkeeping goes: the connection row and, by cascade,
 * its account links. Local accounts, expenses and investment rows are ledger
 * history that happened to arrive through Open Finance — deleting them because
 * a consent was revoked would throw away the user's records.
 *
 * Note this does not revoke anything at the bank. The consent itself lives at
 * meu.pluggy.ai and has to be withdrawn there.
 */
export async function removeConnection(userId: string, connectionId: number) {
  const connection = await requireConnection(userId, connectionId);

  await db.delete(bankConnections).where(eq(bankConnections.id, connection.id));

  return { removed: true };
}

/** Rename a connection, for when one institution is connected more than once. */
export async function renameConnection(input: {
  userId: string;
  connectionId: number;
  connectorName: string;
}) {
  const connection = await requireConnection(input.userId, input.connectionId);
  const name = input.connectorName.trim();
  if (!name)
    throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um nome" });

  await db
    .update(bankConnections)
    .set({ connectorName: name })
    .where(eq(bankConnections.id, connection.id));

  return { connectorName: name };
}

/**
 * The accounts inside one connection, each carrying its local link if it has
 * one and a suggested local account otherwise (reusing the same fuzzy name
 * matcher the file importer uses to pre-select an account).
 */
export async function listProviderAccounts(
  userId: string,
  connectionId: number,
) {
  const connection = await requireConnection(userId, connectionId);

  const [providerAccounts, links, spendingAccounts] = await Promise.all([
    listAccounts(connection.itemId),
    db
      .select()
      .from(bankAccountLinks)
      .where(eq(bankAccountLinks.connectionId, connectionId)),
    accountRepository.findSpendingAccounts(userId),
  ]);

  return providerAccounts.map((providerAccount: PluggyAccount) => {
    const link =
      links.find(
        (candidate) => candidate.providerAccountId === providerAccount.id,
      ) ?? null;

    return {
      providerAccountId: providerAccount.id,
      name: providerAccount.marketingName ?? providerAccount.name,
      number: providerAccount.number,
      type: providerAccount.type,
      subtype: providerAccount.subtype,
      balance: providerAccount.balance,
      linkId: link?.id ?? null,
      linkedAccountId: link?.accountId ?? null,
      suggestedAccountId: link
        ? null
        : matchAccountId(
            `${connection.connectorName} ${providerAccount.name}`,
            spendingAccounts,
          ),
    };
  });
}

/** Point one provider account at one local account. */
export async function linkAccount(input: {
  userId: string;
  connectionId: number;
  providerAccountId: string;
  accountId: number;
  providerType: "BANK" | "CREDIT";
  providerSubtype?: string | null;
  providerName?: string | null;
}) {
  await requireConnection(input.userId, input.connectionId);

  // The local target must belong to the caller and be able to hold expenses,
  // the same gate importStatementRows applies before inserting.
  if (
    !(await accountRepository.ownsSpendingAccount(
      input.userId,
      input.accountId,
    ))
  ) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Conta inválida" });
  }

  await db
    .insert(bankAccountLinks)
    .values({
      connectionId: input.connectionId,
      providerAccountId: input.providerAccountId,
      accountId: input.accountId,
      providerType: input.providerType,
      providerSubtype: input.providerSubtype ?? null,
      providerName: input.providerName ?? null,
    })
    .onConflictDoUpdate({
      target: bankAccountLinks.providerAccountId,
      set: {
        accountId: input.accountId,
        connectionId: input.connectionId,
        providerType: input.providerType,
        providerSubtype: input.providerSubtype ?? null,
        providerName: input.providerName ?? null,
      },
    });
}

export async function unlinkAccount(userId: string, linkId: number) {
  const link = await requireLink(userId, linkId);
  await db.delete(bankAccountLinks).where(eq(bankAccountLinks.id, link.id));
}

/** Assigns all investments from one connection to one local ledger account. */
export async function setConnectionInvestmentAccount(input: {
  userId: string;
  connectionId: number;
  investmentAccountId: number | null;
}) {
  const connection = await requireConnection(input.userId, input.connectionId);
  if (
    input.investmentAccountId !== null &&
    !(await accountRepository.ownsInvestmentAccount(
      input.userId,
      input.investmentAccountId,
    ))
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Conta de investimento inválida",
    });
  }
  await db
    .update(bankConnections)
    .set({ investmentAccountId: input.investmentAccountId })
    .where(eq(bankConnections.id, connection.id));
}

async function requireLink(userId: string, linkId: number) {
  const [row] = await db
    .select({
      link: bankAccountLinks,
      connection: bankConnections,
    })
    .from(bankAccountLinks)
    .innerJoin(
      bankConnections,
      eq(bankAccountLinks.connectionId, bankConnections.id),
    )
    .where(
      and(eq(bankAccountLinks.id, linkId), eq(bankConnections.userId, userId)),
    );

  if (!row)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Conta vinculada não encontrada",
    });
  return { ...row.link, connection: row.connection };
}

/**
 * Pull one linked account's transactions and hand them back as statement rows.
 *
 * Deliberately stops short of writing anything: the caller shows them in the
 * existing preview panel, and the user confirms before a single row reaches
 * the ledger.
 */
export async function fetchLinkedAccountRows(input: {
  userId: string;
  linkId: number;
  days?: number;
}) {
  const link = await requireLink(input.userId, input.linkId);

  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - (input.days ?? DEFAULT_SYNC_DAYS));

  const transactions = await listTransactions({
    accountId: link.providerAccountId,
    from: isoDay(from),
    to: isoDay(to),
  });

  const rows = transactions
    .map((transaction) => toStatementRow(transaction, link.providerType))
    .filter((row): row is StatementRow => row !== null);

  const syncedAt = new Date();
  await db
    .update(bankAccountLinks)
    .set({ lastSyncedAt: syncedAt })
    .where(eq(bankAccountLinks.id, link.id));
  await db
    .update(bankConnections)
    .set({ lastSyncedAt: syncedAt })
    .where(eq(bankConnections.id, link.connectionId));

  return {
    rows,
    accountId: link.accountId,
    institution: link.connection.connectorName,
    fetched: transactions.length,
  };
}

/** Fetches provider investment movements for preview; it never writes a ledger row. */
export async function fetchConnectionInvestmentRows(input: {
  userId: string;
  connectionId: number;
}) {
  const connection = await requireConnection(input.userId, input.connectionId);
  if (connection.investmentAccountId === null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Selecione uma conta de investimento para esta conexão",
    });
  }

  const investments = await listInvestments(connection.itemId);
  const batches = await Promise.all(
    investments.map(async (investment) => ({
      investment,
      movements: await listInvestmentTransactions(investment.id),
    })),
  );

  // Names, fund CNPJs and reported quota values, for every holding the
  // provider returned — recorded here so they land even when every movement
  // turns out to be a duplicate and nothing is imported.
  await recordProviderAssetFacts(input.userId, investments);

  const rows: PluggyInvestmentRow[] = [];
  // Holdings with no movement history at all, offered separately: they are a
  // snapshot rather than a ledger, so importing them is the user's call.
  const positions: PluggyInvestmentRow[] = [];
  let unsupported = 0;
  // Movements the normalizer could not represent. Reported to the user: an
  // under-counted holding is otherwise indistinguishable from a correct one.
  let droppedWithoutQuantity = 0;
  let droppedUnusable = 0;
  // Holdings whose movements do not add up to the position the provider
  // reports — bought before the connector's history window starts.
  // `offered` says whether the missing part could be priced from what the
  // provider reported; when it could not, the only remedy is a manual entry.
  const shortfalls: Array<HoldingShortfall & { offered: boolean }> = [];
  let holdingsWithoutTransactions = 0;
  let holdingsWithoutCostBasis = 0;
  for (const batch of batches) {
    if (batch.movements.length === 0) {
      holdingsWithoutTransactions++;
      const position = normalizeOpeningPosition(batch.investment);
      // No acquisition date or amount paid means there is nothing honest to
      // import — the holding is reported, not invented.
      if (position) positions.push(position);
      else holdingsWithoutCostBasis++;
      continue;
    }
    const normalized = normalizeInvestmentMovements(
      batch.investment,
      batch.movements,
    );
    rows.push(...normalized.rows);
    unsupported += normalized.unsupported.length;
    droppedWithoutQuantity += normalized.dropped.withoutQuantity;
    droppedUnusable += normalized.dropped.unusable;

    const shortfall = holdingShortfall(batch.investment, normalized.rows);
    if (shortfall) {
      // Offered alongside the snapshot positions rather than imported outright:
      // it is a reconstruction, and the user confirms it with the numbers in
      // front of them.
      const reconstructed = normalizeShortfallPosition(
        batch.investment,
        shortfall,
        normalized.rows,
      );
      if (reconstructed) positions.push(reconstructed);
      shortfalls.push({ ...shortfall, offered: reconstructed !== null });
    }
  }

  await db
    .update(bankConnections)
    .set({ lastSyncedAt: new Date() })
    .where(eq(bankConnections.id, connection.id));

  return {
    rows,
    positions,
    accountId: connection.investmentAccountId,
    institution: connection.connectorName,
    holdings: investments.length,
    holdingsWithoutTransactions,
    holdingsWithoutCostBasis,
    unsupported,
    droppedWithoutQuantity,
    droppedUnusable,
    shortfalls,
  };
}

/**
 * Refresh the local balance of every linked account from the provider.
 *
 * BANK accounts only: on a credit card Pluggy's `balance` is the open invoice
 * (money owed), which is not the same quantity as an account balance and would
 * read as a positive cash position here.
 */
export async function refreshLinkedBalances(
  userId: string,
  connectionId: number,
) {
  const connection = await requireConnection(userId, connectionId);

  const [providerAccounts, links] = await Promise.all([
    listAccounts(connection.itemId),
    db
      .select()
      .from(bankAccountLinks)
      .where(eq(bankAccountLinks.connectionId, connectionId)),
  ]);

  const providerById = new Map(
    providerAccounts.map((account) => [account.id, account]),
  );

  let updated = 0;
  for (const link of links) {
    const providerAccount = providerById.get(link.providerAccountId);
    if (!providerAccount) continue;

    await db
      .update(bankAccountLinks)
      .set({ lastBalance: providerAccount.balance })
      .where(eq(bankAccountLinks.id, link.id));

    if (link.providerType === "BANK") {
      await db
        .update(accounts)
        .set({ balance: providerAccount.balance })
        .where(
          and(eq(accounts.id, link.accountId), eq(accounts.userId, userId)),
        );
      updated++;
    }
  }

  // Balances are as fresh as they ever get right now, which makes this the
  // best moment of the day to put them on the net-worth record.
  if (updated > 0) await recordBalanceSnapshots(userId);

  return { updated };
}
