import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PluggyAccount, PluggyInvestment } from "~/server/services/pluggy";
import { investment, providerAccount } from "~/test/pluggy";
import { seedBaseline, type TestDb } from "~/test/db";

vi.mock("~/server/db", async () => {
  const { createTestDb } = await import("~/test/db");
  return { db: await createTestDb() };
});

// The provider shapes here are the ones the real connections return: two
// accounts sharing a name (checking + savings), a card, and — on the other
// connection — two accounts sharing a name *and* a number.
const listAccounts = vi.fn<(itemId: string) => Promise<PluggyAccount[]>>();
const listInvestments =
  vi.fn<(itemId: string) => Promise<PluggyInvestment[]>>();

vi.mock("~/server/services/pluggy", () => ({
  listAccounts: (itemId: string) => listAccounts(itemId),
  listInvestments: (itemId: string) => listInvestments(itemId),
  listInvestmentTransactions: vi.fn(),
  listTransactions: vi.fn(),
  getItem: vi.fn(),
}));

const { db } = (await import("~/server/db")) as unknown as { db: TestDb };
const { accounts, bankAccountLinks, bankConnections } =
  await import("~/server/db/schema");
const { provisionConnectionAccounts } = await import("./provision");
const { eq } = await import("drizzle-orm");

let baseline: Awaited<ReturnType<typeof seedBaseline>>;

beforeAll(async () => {
  baseline = await seedBaseline(db);
});

beforeEach(() => {
  listAccounts.mockReset();
  listInvestments.mockReset().mockResolvedValue([]);
});

async function createConnection(itemId: string) {
  const [connection] = await db
    .insert(bankConnections)
    .values({
      userId: baseline.userId,
      provider: "pluggy",
      itemId,
      connectorName: "MeuPluggy",
      status: "UPDATED",
    })
    .returning();
  return connection!;
}

async function accountsOf(ids: number[]) {
  const all = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, baseline.userId));
  return ids.map((id) => all.find((account) => account.id === id)!);
}

describe("provisionConnectionAccounts", () => {
  it("creates one local account per provider account and links them", async () => {
    const connection = await createConnection("item-create");
    listAccounts.mockResolvedValue([
      providerAccount({
        id: "inter-checking",
        number: "16369714-0",
        balance: 342.26,
      }),
      providerAccount({
        id: "inter-savings",
        subtype: "SAVINGS_ACCOUNT",
        number: "16369714-P",
      }),
      providerAccount({
        id: "inter-card",
        type: "CREDIT",
        subtype: "CREDIT_CARD",
        number: "9600",
        name: "GOLD",
        balance: 284.04,
      }),
    ]);

    const result = await provisionConnectionAccounts(
      baseline.userId,
      connection.id,
    );

    expect(result.created).toHaveLength(3);
    expect(result.linked).toHaveLength(0);
    const created = await accountsOf(
      result.created.map((entry) => entry.accountId),
    );
    // Two accounts share the provider name, so the subtype is what tells them
    // apart — the number is only reached when even that collides.
    expect(created.map((account) => account.name)).toEqual([
      "BANCO INTER",
      "BANCO INTER - Poupança",
      "GOLD",
    ]);
    expect(created.map((account) => account.accountType)).toEqual([
      "CHECKING",
      "CHECKING",
      "CREDIT_CARD",
    ]);
    // The card's provider balance is the open invoice, not money held.
    expect(created.map((account) => account.balance)).toEqual([342.26, 0, 0]);

    const links = await db
      .select()
      .from(bankAccountLinks)
      .where(eq(bankAccountLinks.connectionId, connection.id));
    expect(links).toHaveLength(3);
    expect(links.map((link) => link.providerAccountId).sort()).toEqual([
      "inter-card",
      "inter-checking",
      "inter-savings",
    ]);
  });

  it("is idempotent: a second run touches nothing", async () => {
    const connection = await createConnection("item-idempotent");
    listAccounts.mockResolvedValue([
      providerAccount({ id: "idem-1", name: "NUBANK", number: "7" }),
    ]);

    await provisionConnectionAccounts(baseline.userId, connection.id);
    const before = await db.select().from(accounts);

    const second = await provisionConnectionAccounts(
      baseline.userId,
      connection.id,
    );

    expect(second.created).toHaveLength(0);
    expect(second.linked).toHaveLength(0);
    expect(await db.select().from(accounts)).toHaveLength(before.length);
  });

  it("adopts an account the user already keeps, but only once", async () => {
    const connection = await createConnection("item-adopt");
    const [existing] = await db
      .insert(accounts)
      .values({
        userId: baseline.userId,
        name: "XP - Corrente",
        accountType: "CHECKING",
        balance: 10,
      })
      .returning();
    listAccounts.mockResolvedValue([
      providerAccount({ id: "xp-1", name: "XP", number: "01555011-8" }),
      // Same name *and* number: the provider genuinely reports these twins.
      providerAccount({ id: "xp-2", name: "XP", number: "01555011-8" }),
    ]);

    const result = await provisionConnectionAccounts(
      baseline.userId,
      connection.id,
    );

    expect(result.linked.map((entry) => entry.accountId)).toEqual([
      existing!.id,
    ]);
    // The second twin cannot take the same ledger account: it would merge two
    // statements into one balance.
    expect(result.created).toHaveLength(1);
    const [created] = await accountsOf([result.created[0]!.accountId]);
    expect(created!.name).toBe("XP");
    // The adopted account keeps the balance the user had.
    expect((await accountsOf([existing!.id]))[0]!.balance).toBe(10);
  });

  it("creates an investment account when the connection holds assets", async () => {
    const connection = await createConnection("item-investments");
    listAccounts.mockResolvedValue([
      providerAccount({ id: "brokerage-1", name: "AGORA", number: "5" }),
    ]);
    // Only the presence of a holding matters here, but it has to be a real one.
    listInvestments.mockResolvedValue([investment({ id: "holding-1" })]);

    const result = await provisionConnectionAccounts(
      baseline.userId,
      connection.id,
    );

    expect(result.investmentAccount?.created).toBe(true);
    expect(result.investmentAccount?.name).toBe("AGORA - Investimentos");
    const [stored] = await db
      .select()
      .from(bankConnections)
      .where(eq(bankConnections.id, connection.id));
    expect(stored!.investmentAccountId).toBe(
      result.investmentAccount!.accountId,
    );
  });

  it("leaves the investment account alone when there are no holdings", async () => {
    const connection = await createConnection("item-no-holdings");
    listAccounts.mockResolvedValue([
      providerAccount({ id: "cash-only", name: "PICPAY", number: "3" }),
    ]);

    const result = await provisionConnectionAccounts(
      baseline.userId,
      connection.id,
    );

    expect(result.investmentAccount).toBeNull();
    const [stored] = await db
      .select()
      .from(bankConnections)
      .where(eq(bankConnections.id, connection.id));
    expect(stored!.investmentAccountId).toBeNull();
  });

  it("re-points a link left dangling by a deleted account", async () => {
    // Deleting an account does not take its link with it — SQLite is not
    // enforcing that foreign key — so the provider account would otherwise
    // stay bound to an account id that no longer exists.
    const connection = await createConnection("item-dangling");
    const [gone] = await db
      .insert(accounts)
      .values({
        userId: baseline.userId,
        name: "Apagada",
        accountType: "CHECKING",
        balance: 0,
      })
      .returning();
    await db.insert(bankAccountLinks).values({
      connectionId: connection.id,
      providerAccountId: "dangling-1",
      accountId: gone!.id,
      providerType: "BANK",
    });
    await db.delete(accounts).where(eq(accounts.id, gone!.id));

    listAccounts.mockResolvedValue([
      providerAccount({ id: "dangling-1", name: "SICREDI", number: "9" }),
    ]);

    const result = await provisionConnectionAccounts(
      baseline.userId,
      connection.id,
    );

    expect(result.created).toHaveLength(1);
    const [link] = await db
      .select()
      .from(bankAccountLinks)
      .where(eq(bankAccountLinks.providerAccountId, "dangling-1"));
    expect(link!.accountId).toBe(result.created[0]!.accountId);
  });

  it("refuses a connection belonging to someone else", async () => {
    const connection = await createConnection("item-other-user");

    await expect(
      provisionConnectionAccounts("someone-else", connection.id),
    ).rejects.toThrow("Conexão não encontrada");
  });
});
