import { beforeAll, describe, expect, it, vi } from "vitest";

import { seedBaseline, type TestDb } from "~/test/db";

vi.mock("~/server/db", async () => {
  const { createTestDb } = await import("~/test/db");
  return { db: await createTestDb() };
});

const { db } = (await import("~/server/db")) as unknown as { db: TestDb };
const { accounts, bankAccountLinks, bankConnections, expenses } =
  await import("~/server/db/schema");
const { listConnections, removeConnection, renameConnection } =
  await import("./sync");

let baseline: Awaited<ReturnType<typeof seedBaseline>>;

beforeAll(async () => {
  baseline = await seedBaseline(db);
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

  await db.insert(bankAccountLinks).values({
    connectionId: connection!.id,
    providerAccountId: `${itemId}-acct`,
    accountId: baseline.checkingAccountId,
    providerType: "BANK",
  });

  return connection!;
}

describe("removeConnection", () => {
  it("removes the connection and its account links", async () => {
    const connection = await createConnection("item-remove");

    await removeConnection(baseline.userId, connection.id);

    expect(await db.select().from(bankConnections)).not.toContainEqual(
      expect.objectContaining({ id: connection.id }),
    );
    const links = await db.select().from(bankAccountLinks);
    expect(
      links.filter((link) => link.connectionId === connection.id),
    ).toHaveLength(0);
  });

  it("leaves the local account and its expenses alone", async () => {
    // The ledger is the user's record of what happened; it merely arrived
    // through Open Finance. Losing it because a consent was dropped would be
    // the worst possible reading of "remove connection".
    const connection = await createConnection("item-keeps-ledger");
    await db.insert(expenses).values({
      checkingAccountId: baseline.checkingAccountId,
      categoryId: baseline.categoryId,
      amount: 42,
      expenseDate: "2026-03-14",
      source: "IMPORT",
      sourceHash: "ofx:keep-me",
    });

    await removeConnection(baseline.userId, connection.id);

    expect(await db.select().from(expenses)).toHaveLength(1);
    expect(
      (await db.select().from(accounts)).some(
        (account) => account.id === baseline.checkingAccountId,
      ),
    ).toBe(true);
  });

  it("refuses a connection belonging to someone else", async () => {
    const connection = await createConnection("item-other-owner");

    await expect(
      removeConnection("someone-else", connection.id),
    ).rejects.toThrow("Conexão não encontrada");

    // And it is still there.
    const remaining = await listConnections(baseline.userId);
    expect(remaining.map((entry) => entry.id)).toContain(connection.id);
  });
});

describe("renameConnection", () => {
  it("renames a connection the caller owns", async () => {
    const connection = await createConnection("item-rename");

    await renameConnection({
      userId: baseline.userId,
      connectionId: connection.id,
      connectorName: "  Inter  ",
    });

    const [renamed] = (await listConnections(baseline.userId)).filter(
      (entry) => entry.id === connection.id,
    );
    expect(renamed?.connectorName).toBe("Inter");
  });

  it("rejects an empty name", async () => {
    const connection = await createConnection("item-empty-name");

    await expect(
      renameConnection({
        userId: baseline.userId,
        connectionId: connection.id,
        connectorName: "   ",
      }),
    ).rejects.toThrow("Informe um nome");
  });
});
