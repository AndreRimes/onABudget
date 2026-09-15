// Turns the accounts a connection exposes into local ledger accounts, so the
// user does not have to create and link one by one.
//
// Two rules keep this from making a mess of the ledger:
//
//  - it never touches a provider account that already has a link, so running
//    it twice is a no-op rather than a second set of accounts;
//  - it prefers an existing local account when the same fuzzy matcher the
//    linking panel uses is confident about one, and only creates when it is
//    not — otherwise a user who already keeps an "INTER" account would end up
//    with two of them, with the history split between them.
import { eq, inArray } from "drizzle-orm";

import type { AccountType } from "~/lib/account-type";
import { db } from "~/server/db";
import {
  accounts,
  bankAccountLinks,
  bankConnections,
} from "~/server/db/schema";
import {
  listAccounts,
  listInvestments,
  type PluggyAccount,
} from "~/server/services/pluggy";
import { matchAccountId } from "../accounts/match";
import { requireConnection } from "./sync";

/**
 * Subtypes worth spelling out in the account name. A checking account needs no
 * qualifier — it is the default reading of a bank account — but a savings
 * account sharing its name with one does.
 */
const SUBTYPE_LABELS: Record<string, string> = {
  SAVINGS_ACCOUNT: "Poupança",
};

interface ProvisionedAccount {
  /** Local account id the provider account now points at. */
  accountId: number;
  name: string;
  /** False when an account the user already had was reused. */
  created: boolean;
}

export interface ProvisionResult {
  created: ProvisionedAccount[];
  linked: ProvisionedAccount[];
  /** Null when the connection reports no holdings, or already had an account. */
  investmentAccount: ProvisionedAccount | null;
}

function nameKey(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * A name for the new account that no other account of the user answers to.
 *
 * The provider is no help here: one connection reports two accounts both named
 * "BANCO INTER" (differing only by subtype), and another reports two named
 * "XP" carrying the *same* number. So the qualifiers are tried in order of how
 * much they say — subtype, then number, then a plain counter, which is ugly
 * but never collides.
 */
function uniqueName(base: string, suffix: string | null, taken: Set<string>) {
  const candidates = [base, suffix ? `${base} ····${suffix}` : null].filter(
    (candidate): candidate is string => candidate !== null,
  );
  for (const candidate of candidates) {
    if (!taken.has(nameKey(candidate))) return candidate;
  }
  const last = candidates[candidates.length - 1]!;
  for (let n = 2; ; n++) {
    const candidate = `${last} (${n})`;
    if (!taken.has(nameKey(candidate))) return candidate;
  }
}

function providerAccountName(providerAccount: PluggyAccount): string {
  const base = (providerAccount.marketingName ?? providerAccount.name).trim();
  const label = SUBTYPE_LABELS[providerAccount.subtype ?? ""];
  if (!base) return label ?? "Conta";
  return label ? `${base} - ${label}` : base;
}

/**
 * The institution this connection is really about.
 *
 * `connectorName` cannot answer it on the free tier: every connection there
 * comes back as "MeuPluggy", whatever bank is behind it. The accounts do know
 * — they are named "BANCO INTER", "XP" — so the most common of those names is
 * what the investment account gets called.
 */
function institutionName(
  providerAccounts: PluggyAccount[],
  fallback: string,
): string {
  const counts = new Map<string, { name: string; count: number }>();
  for (const providerAccount of providerAccounts) {
    const name = (providerAccount.marketingName ?? providerAccount.name).trim();
    if (!name) continue;
    const entry = counts.get(nameKey(name)) ?? { name, count: 0 };
    entry.count++;
    counts.set(nameKey(name), entry);
  }
  const best = [...counts.values()].sort((a, b) => b.count - a.count)[0];
  return best?.name ?? fallback;
}

function localType(providerAccount: PluggyAccount): AccountType {
  return providerAccount.type === "CREDIT" ? "CREDIT_CARD" : "CHECKING";
}

/**
 * Create (or adopt) one local account per provider account of a connection,
 * link them, and give the connection an investment account when it holds
 * assets.
 */
export async function provisionConnectionAccounts(
  userId: string,
  connectionId: number,
): Promise<ProvisionResult> {
  const connection = await requireConnection(userId, connectionId);

  const [providerAccounts, userAccounts, connections] = await Promise.all([
    listAccounts(connection.itemId),
    db
      .select({
        id: accounts.id,
        name: accounts.name,
        accountType: accounts.accountType,
      })
      .from(accounts)
      .where(eq(accounts.userId, userId)),
    db
      .select({
        id: bankConnections.id,
        investmentAccountId: bankConnections.investmentAccountId,
      })
      .from(bankConnections)
      .where(eq(bankConnections.userId, userId)),
  ]);

  // Every link the user has, not just this connection's: a provider account
  // linked under a stale connection still owns its local account.
  const ownLinks = await db
    .select()
    .from(bankAccountLinks)
    .where(
      inArray(
        bankAccountLinks.connectionId,
        connections.map((item) => item.id),
      ),
    );

  // SQLite does not enforce the link's foreign key here, so a link can outlive
  // the account it points at (deleting an account leaves it dangling). Such a
  // link is treated as no link at all — otherwise the provider account would
  // stay bound to an account that no longer exists, forever.
  const localAccountIds = new Set(userAccounts.map((account) => account.id));
  const liveLinks = ownLinks.filter((link) =>
    localAccountIds.has(link.accountId),
  );

  const linkedProviderAccounts = new Set(
    liveLinks.map((link) => link.providerAccountId),
  );
  // A local account already fed by some provider account is off limits: two
  // provider accounts pointing at one ledger account would merge two banks'
  // statements into a single balance.
  const takenAccountIds = new Set<number>([
    ...liveLinks.map((link) => link.accountId),
    ...connections
      .map((item) => item.investmentAccountId)
      .filter((id): id is number => id !== null && localAccountIds.has(id)),
  ]);
  const takenNames = new Set(
    userAccounts.map((account) => nameKey(account.name)),
  );

  const result: ProvisionResult = {
    created: [],
    linked: [],
    investmentAccount: null,
  };

  for (const providerAccount of providerAccounts) {
    if (linkedProviderAccounts.has(providerAccount.id)) continue;

    const accountType = localType(providerAccount);
    const name = providerAccountName(providerAccount);
    // Same string the linking panel matches on, so the button links exactly
    // where the panel's suggestion said it would.
    const matched = matchAccountId(
      `${connection.connectorName} ${providerAccount.name}`,
      userAccounts.filter(
        (account) =>
          account.accountType === accountType &&
          !takenAccountIds.has(account.id),
      ),
    );

    let entry: ProvisionedAccount;
    if (matched !== null) {
      entry = {
        accountId: matched,
        name: userAccounts.find((account) => account.id === matched)!.name,
        created: false,
      };
    } else {
      const accountName = uniqueName(name, providerAccount.number, takenNames);
      const [created] = await db
        .insert(accounts)
        .values({
          userId,
          name: accountName,
          accountType,
          // A credit card's provider balance is the open invoice, not money
          // held — the same reason refreshLinkedBalances skips CREDIT.
          balance:
            providerAccount.type === "BANK" ? providerAccount.balance : 0,
        })
        .returning({ id: accounts.id, name: accounts.name });
      takenNames.add(nameKey(created!.name));
      userAccounts.push({
        id: created!.id,
        name: created!.name,
        accountType,
      });
      entry = { accountId: created!.id, name: created!.name, created: true };
    }

    await db
      .insert(bankAccountLinks)
      .values({
        connectionId: connection.id,
        providerAccountId: providerAccount.id,
        accountId: entry.accountId,
        providerType: providerAccount.type,
        providerSubtype: providerAccount.subtype,
        providerName: providerAccount.name,
        lastBalance: providerAccount.balance,
      })
      .onConflictDoUpdate({
        target: bankAccountLinks.providerAccountId,
        set: {
          connectionId: connection.id,
          accountId: entry.accountId,
          providerType: providerAccount.type,
          providerSubtype: providerAccount.subtype,
          providerName: providerAccount.name,
          lastBalance: providerAccount.balance,
        },
      });

    takenAccountIds.add(entry.accountId);
    (entry.created ? result.created : result.linked).push(entry);
  }

  if (
    connection.investmentAccountId === null ||
    !localAccountIds.has(connection.investmentAccountId)
  ) {
    // Only asked once the accounts are settled, and only when it can still
    // change something — it is a second round trip to the provider.
    const holdings = await listInvestments(connection.itemId);
    if (holdings.length > 0) {
      const institution = institutionName(
        providerAccounts,
        connection.connectorName,
      );
      const matched = matchAccountId(
        `${connection.connectorName} ${institution}`,
        userAccounts.filter(
          (account) =>
            account.accountType === "INVESTMENT" &&
            !takenAccountIds.has(account.id),
        ),
      );

      if (matched !== null) {
        result.investmentAccount = {
          accountId: matched,
          name: userAccounts.find((account) => account.id === matched)!.name,
          created: false,
        };
      } else {
        const [created] = await db
          .insert(accounts)
          .values({
            userId,
            name: uniqueName(
              `${institution} - Investimentos`,
              null,
              takenNames,
            ),
            accountType: "INVESTMENT",
            balance: 0,
          })
          .returning({ id: accounts.id, name: accounts.name });
        takenNames.add(nameKey(created!.name));
        result.investmentAccount = {
          accountId: created!.id,
          name: created!.name,
          created: true,
        };
      }

      await db
        .update(bankConnections)
        .set({ investmentAccountId: result.investmentAccount.accountId })
        .where(eq(bankConnections.id, connection.id));
    }
  }

  return result;
}
