// The cash side of "equal to the bank": after a refresh, the balance the app
// shows for a linked account is the balance the institution reported. Not
// derived, not accumulated from transactions — copied, because the bank is the
// authority on its own balance.
//
// `refreshLinkedBalances` had no test at all, including the rule that makes a
// credit card the deliberate exception.
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { PluggyAccount } from "~/server/services/pluggy";
import { providerAccount } from "~/test/pluggy";
import { seedBaseline, type TestDb } from "~/test/db";

const listAccounts = vi.fn<(itemId: string) => Promise<PluggyAccount[]>>();

vi.mock("~/server/services/pluggy", () => ({
  listAccounts: (itemId: string) => listAccounts(itemId),
  listInvestments: vi.fn(),
  listInvestmentTransactions: vi.fn(),
  listTransactions: vi.fn(),
  getItem: vi.fn(),
}));

vi.mock("~/server/db", async () => {
  const { createTestDb } = await import("~/test/db");
  return { db: await createTestDb() };
});

const { db } = (await import("~/server/db")) as unknown as { db: TestDb };
const { eq } = await import("drizzle-orm");
const { accountBalanceSnapshots, accounts, bankAccountLinks, bankConnections } =
  await import("~/server/db/schema");
const { refreshLinkedBalances } = await import("./sync");

let baseline: Awaited<ReturnType<typeof seedBaseline>>;
let connectionId: number;
let cardAccountId: number;

beforeAll(async () => {
  baseline = await seedBaseline(db);

  const [connection] = await db
    .insert(bankConnections)
    .values({
      userId: baseline.userId,
      provider: "pluggy",
      itemId: "item-balances",
      connectorName: "Banco Inter",
    })
    .returning();
  connectionId = connection!.id;

  const [card] = await db
    .insert(accounts)
    .values({
      userId: baseline.userId,
      name: "Cartão",
      accountType: "CREDIT_CARD",
      balance: 0,
    })
    .returning();
  cardAccountId = card!.id;

  await db.insert(bankAccountLinks).values([
    {
      connectionId,
      providerAccountId: "provider-checking",
      accountId: baseline.checkingAccountId,
      providerType: "BANK",
    },
    {
      connectionId,
      providerAccountId: "provider-card",
      accountId: cardAccountId,
      providerType: "CREDIT",
    },
  ]);
});

async function balanceOf(accountId: number): Promise<number> {
  const [account] = await db
    .select({ balance: accounts.balance })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  return account!.balance;
}

describe("refreshLinkedBalances", () => {
  it("copies the bank's balance onto the local account", async () => {
    listAccounts.mockResolvedValue([
      providerAccount({ id: "provider-checking", balance: 342.26 }),
      providerAccount({
        id: "provider-card",
        type: "CREDIT",
        subtype: "CREDIT_CARD",
        balance: 284.04,
      }),
    ]);

    const result = await refreshLinkedBalances(baseline.userId, connectionId);

    expect(result).toEqual({ updated: 1 });
    expect(await balanceOf(baseline.checkingAccountId)).toBe(342.26);
  });

  it("records the link balance for every account, card included", async () => {
    // The card's figure is still worth keeping — it is the open invoice, and
    // the Open Finance page prints it. It just is not a cash balance.
    const links = await db
      .select({
        providerAccountId: bankAccountLinks.providerAccountId,
        lastBalance: bankAccountLinks.lastBalance,
      })
      .from(bankAccountLinks)
      .where(eq(bankAccountLinks.connectionId, connectionId));

    expect(
      Object.fromEntries(
        links.map((link) => [link.providerAccountId, link.lastBalance]),
      ),
    ).toEqual({ "provider-checking": 342.26, "provider-card": 284.04 });
  });

  it("leaves the credit card's account balance alone", async () => {
    // Deliberate: on a card the provider's balance is what is owed, so copying
    // it would add a stale number of the wrong sign to net worth.
    expect(await balanceOf(cardAccountId)).toBe(0);
  });

  it("puts the refreshed balance on the net-worth record", async () => {
    const snapshots = await db
      .select()
      .from(accountBalanceSnapshots)
      .where(eq(accountBalanceSnapshots.accountId, baseline.checkingAccountId));

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.balance).toBe(342.26);
  });

  it("tracks the bank when the balance moves", async () => {
    listAccounts.mockResolvedValue([
      providerAccount({ id: "provider-checking", balance: 1180.5 }),
    ]);

    await refreshLinkedBalances(baseline.userId, connectionId);

    expect(await balanceOf(baseline.checkingAccountId)).toBe(1180.5);
  });

  it("leaves a balance untouched when the bank stops reporting the account", async () => {
    // An account missing from the payload is not an account worth zero.
    listAccounts.mockResolvedValue([]);

    const result = await refreshLinkedBalances(baseline.userId, connectionId);

    expect(result).toEqual({ updated: 0 });
    expect(await balanceOf(baseline.checkingAccountId)).toBe(1180.5);
  });

  it("refuses a connection that belongs to someone else", async () => {
    await expect(
      refreshLinkedBalances("someone-else", connectionId),
    ).rejects.toThrow("Conexão não encontrada");
  });
});
