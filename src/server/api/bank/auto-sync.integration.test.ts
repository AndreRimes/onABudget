// The background sync, end to end against a fake Pluggy: what the bank
// reports must be what the app holds afterwards, and running it again must
// change nothing.
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { seedBaseline, type TestDb } from "~/test/db";
import type * as StatementImport from "../expenses/statement-import";
import type {
  PluggyInvestment,
  PluggyInvestmentTransaction,
  PluggyTransaction,
} from "~/server/services/pluggy";

vi.mock("~/server/db", async () => {
  const { createTestDb } = await import("~/test/db");
  return { db: await createTestDb() };
});

vi.mock("./owner", () => ({ isOpenFinanceOwner: () => true }));

let failImport = false;
vi.mock("../expenses/statement-import", async (importOriginal) => {
  const actual = await importOriginal<typeof StatementImport>();
  return {
    ...actual,
    importStatementRows: async (
      ...args: Parameters<typeof actual.importStatementRows>
    ) => {
      if (failImport) throw new Error("import failed");
      return actual.importStatementRows(...args);
    },
  };
});

vi.mock("~/server/services/market-cache", () => ({
  todayIso: () => new Date().toISOString().slice(0, 10),
  marketCacheService: {
    getQuotes: async () => new Map(),
    getCandles: async () => new Map(),
    getBenchmarks: async () => new Map(),
    getTesouroPrices: async () => new Map(),
    getFundQuotas: async () => new Map(),
  },
}));

const recentDay = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

let itemStatus = "UPDATED";
let holdingReported = true;

const transactions: PluggyTransaction[] = [
  {
    // Dated before the last manual sync: reviewed then, before skips were
    // recorded — never this job's to import.
    id: "tx-before",
    accountId: "acct-1",
    date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10),
    description: "Antes",
    descriptionRaw: null,
    amount: 999,
    currencyCode: "BRL",
    type: "DEBIT",
    status: "POSTED",
    category: "Mercado",
  },
  {
    // Left out of a manual sync by the owner: a transfer to themselves.
    id: "tx-dismissed",
    accountId: "acct-1",
    date: recentDay,
    description: "PIX para mim",
    descriptionRaw: null,
    amount: 300,
    currencyCode: "BRL",
    type: "DEBIT",
    status: "POSTED",
    category: "Transferência",
  },
  {
    id: "tx-market",
    accountId: "acct-1",
    date: recentDay,
    description: "Supermercado",
    descriptionRaw: null,
    amount: 80,
    currencyCode: "BRL",
    type: "DEBIT",
    status: "POSTED",
    category: "Mercado",
  },
  {
    id: "tx-unknown",
    accountId: "acct-1",
    date: recentDay,
    description: "Loja qualquer",
    descriptionRaw: null,
    amount: 25,
    currencyCode: "BRL",
    type: "DEBIT",
    status: "POSTED",
    category: null,
  },
  {
    id: "tx-salary",
    accountId: "acct-1",
    date: recentDay,
    description: "Salário",
    descriptionRaw: null,
    amount: 5000,
    currencyCode: "BRL",
    type: "CREDIT",
    status: "POSTED",
  },
];

// 14 shares held, 6 of them inside the connector's window.
const investment: PluggyInvestment = {
  id: "inv-1",
  itemId: "item-1",
  name: "PETROBRAS PN",
  code: "PETR3",
  currencyCode: "BRL",
  type: "EQUITY",
  subtype: "STOCK",
  quantity: 14,
  value: 40,
  amount: 560,
  balance: 560,
  date: recentDay,
  dueDate: null,
  amountOriginal: 420,
  amountProfit: 140,
  rate: null,
  rateType: null,
  fixedAnnualRate: null,
};
// A CDB the owner already keeps under its B3 product name; the bank knows it
// by its own code, with no movements — only a position to open.
const unknownCdb: PluggyInvestment = {
  ...investment,
  id: "inv-cdb",
  name: "CDB - BANCO DIGIMAIS S.A.",
  code: "CDBA251SW5G",
  type: "FIXED_INCOME",
  subtype: "CDB",
  quantity: 3,
  value: 1173.24,
  amount: 3519.71,
  balance: 3519.71,
  issueDate: "2025-10-01",
  amountOriginal: 3000,
  amountProfit: 519.71,
};
const movements: PluggyInvestmentTransaction[] = [
  {
    id: "mv-1",
    type: "BUY",
    quantity: 6,
    value: 30,
    amount: 180,
    date: "2026-03-10",
    tradeDate: "2026-03-10",
  },
];

vi.mock("~/server/services/pluggy", () => ({
  hasPluggyCredentials: () => true,
  getItem: async (itemId: string) => ({
    status: itemId === "item-1" ? itemStatus : "LOGIN_ERROR",
    connector: { name: "Banco" },
  }),
  listAccounts: async () => [
    {
      id: "acct-1",
      itemId: "item-1",
      type: "BANK",
      subtype: "CHECKING_ACCOUNT",
      number: null,
      name: "Conta",
      marketingName: null,
      balance: 1234.5,
      currencyCode: "BRL",
    },
  ],
  listTransactions: async () => transactions,
  listInvestments: async () =>
    holdingReported ? [investment, unknownCdb] : [],
  listInvestmentTransactions: async (id: string) =>
    id === investment.id ? movements : [],
}));

const { db } = (await import("~/server/db")) as unknown as { db: TestDb };
const {
  accounts,
  bankAccountLinks,
  bankConnections,
  dismissedStatementRows,
  expenses,
  investmentTransactions,
  providerHoldings,
  expenseCategories,
} = await import("~/server/db/schema");
const { syncAllBanks } = await import("./auto-sync");
const { ownerHash } = await import("../owner-hash");
const { investmentRepository } = await import("../investments/repository");

let baseline: Awaited<ReturnType<typeof seedBaseline>>;
let connectionId: number;

/** The last manual sync was an hour ago, out of the review grace period. */
async function idleSinceAnHour() {
  await db
    .update(bankConnections)
    .set({ lastSyncedAt: new Date(Date.now() - 60 * 60 * 1000) })
    .where(eq(bankConnections.id, connectionId));
}

beforeAll(async () => {
  baseline = await seedBaseline(db);
  const [connection] = await db
    .insert(bankConnections)
    .values({
      userId: baseline.userId,
      itemId: "item-1",
      connectorName: "Banco",
      investmentAccountId: baseline.investmentAccountId,
    })
    .returning();
  connectionId = connection!.id;
  await db.insert(bankAccountLinks).values({
    connectionId,
    providerAccountId: "acct-1",
    accountId: baseline.checkingAccountId,
    providerType: "BANK",
    lastSyncedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  });
  // The R$25 charge already came in from a statement file: not twice. The
  // R$80 cash purchase typed by hand is a different expense from the bank's.
  await db.insert(expenses).values([
    {
      checkingAccountId: baseline.checkingAccountId,
      categoryId: baseline.categoryId,
      amount: 25,
      expenseDate: recentDay,
      source: "IMPORT",
      sourceHash: `${baseline.userId}:stmt:loja`,
    },
    {
      checkingAccountId: baseline.checkingAccountId,
      categoryId: baseline.categoryId,
      amount: 80,
      expenseDate: recentDay,
      source: "MANUAL",
    },
  ]);
  await db.insert(dismissedStatementRows).values({
    sourceHash: ownerHash(baseline.userId, "ofx:acct-1:tx-dismissed"),
    userId: baseline.userId,
    dismissedAt: new Date(),
  });
  // PETR3's movement came in through an earlier sync in the dialog.
  await db.insert(investmentTransactions).values({
    investmentAccountId: baseline.investmentAccountId,
    assetTypeId: baseline.assetTypeId,
    assetName: "PETR3",
    transactionType: "BUY",
    quantity: 6,
    pricePerUnit: 30,
    totalAmount: 180,
    transactionDate: "2026-03-10",
    isFixedIncome: false,
    sourceHash: ownerHash(baseline.userId, "pluggy:investment:inv-1:mv-1"),
  });
  // A holding the bank reported once and no longer does.
  await db.insert(providerHoldings).values({
    userId: baseline.userId,
    assetName: "OLD11",
    quantity: 5,
    value: 999,
    syncedAt: new Date(),
  });
});

async function state() {
  const snapshot = await investmentRepository.getPortfolioSnapshot(
    baseline.userId,
    "max",
    false,
  );
  const spent = await db
    .select({ amount: expenses.amount, category: expenseCategories.name })
    .from(expenses)
    .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
    .where(eq(expenses.checkingAccountId, baseline.checkingAccountId));
  const [account] = await db
    .select({ balance: accounts.balance })
    .from(accounts)
    .where(eq(accounts.id, baseline.checkingAccountId));
  return { snapshot, spent, balance: account!.balance };
}

describe("syncAllBanks", () => {
  it("keeps its starting point when the first import fails", async () => {
    const [before] = await db.select().from(bankAccountLinks);
    failImport = true;
    await idleSinceAnHour();

    await syncAllBanks();

    failImport = false;
    const [after] = await db.select().from(bankAccountLinks);
    // The fetch moved `lastSyncedAt`; the window did not move with it.
    expect(after!.lastSyncedAt!.getTime()).toBeGreaterThan(
      before!.lastSyncedAt!.getTime(),
    );
    expect(after!.autoSyncFrom).toEqual(before!.lastSyncedAt);
  });

  it("leaves the app agreeing with the bank, and is idempotent", async () => {
    await idleSinceAnHour();
    await syncAllBanks();
    const first = await state();

    expect(first.balance).toBe(1234.5);
    // Both debits, none dropped for want of a category; the credit is not
    // spending, the hand-typed charge is not doubled, and the transfer the
    // owner left out stays out.
    expect(
      first.spent
        .map((row) => `${row.category}:${row.amount}`)
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual(["Alimentação:25", "Alimentação:80", "Mercado:80"]);
    // Nothing booked against the figure the bank stopped reporting, and
    // nothing added for the CDB the ledger does not hold by that name.
    expect(first.snapshot.holdings.map((holding) => holding.assetName)).toEqual(
      ["PETR3"],
    );
    expect(
      (await db.select().from(providerHoldings))
        .map((row) => row.assetName)
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual(["CDBA251SW5G", "PETR3"]);

    const [petr] = first.snapshot.holdings;
    expect(petr?.assetName).toBe("PETR3");
    expect(petr?.quantity).toBeCloseTo(14, 9);
    expect(petr?.currentValue).toBeCloseTo(560, 6);
    expect(petr?.unrealizedGain).toBeCloseTo(140, 6);
    // Only the CDB disagrees — the bank holds it, the ledger keeps it under
    // another name — and it is left for the owner, not booked twice.
    expect(
      first.snapshot.reconciliation.mismatches.map((entry) => entry.assetName),
    ).toEqual(["CDBA251SW5G"]);

    await idleSinceAnHour();
    await syncAllBanks();
    const second = await state();
    expect(second.spent).toHaveLength(first.spent.length);
    expect(second.snapshot.holdings).toEqual(first.snapshot.holdings);
  });

  it("does not trust holdings from an item that stopped updating", async () => {
    // The bank's cached figures now say 20 shares, but the item is in error.
    investment.quantity = 20;
    investment.balance = 800;
    itemStatus = "LOGIN_ERROR";
    await idleSinceAnHour();

    await syncAllBanks();

    expect((await state()).snapshot.holdings[0]?.quantity).toBeCloseTo(14, 9);
    itemStatus = "UPDATED";
    investment.quantity = 14;
    investment.balance = 560;
  });

  it("takes its adjustment back when the movement it stood in for arrives", async () => {
    // The pre-window purchase finally comes through — the very trade the
    // plug had stood in for (8 shares at the bank's R$30 unit cost, the day
    // before the first movement). It must be imported, not taken for the plug.
    movements.push({
      id: "mv-0",
      type: "BUY",
      quantity: 8,
      value: 30,
      amount: 240,
      date: "2026-03-09",
      tradeDate: "2026-03-09",
    });
    await idleSinceAnHour();

    await syncAllBanks();

    const rows = await db
      .select()
      .from(investmentTransactions)
      .where(eq(investmentTransactions.assetName, "PETR3"));
    expect(rows.map((row) => row.quantity).sort((a, b) => a - b)).toEqual([
      6, 8,
    ]);
    expect(rows.every((row) => row.sourceHash?.includes(":pluggy:"))).toBe(
      true,
    );
    expect((await state()).snapshot.holdings[0]?.quantity).toBeCloseTo(14, 9);
  });

  it("closes a holding the bank stops reporting, for good", async () => {
    holdingReported = false;
    await idleSinceAnHour();

    await syncAllBanks();
    expect((await state()).snapshot.holdings).toEqual([]);

    // Its figure is gone now; the next run must not reopen it.
    await idleSinceAnHour();
    await syncAllBanks();
    expect((await state()).snapshot.holdings).toEqual([]);
    holdingReported = true;
  });

  it("keeps settling a healthy bank while another connection is down", async () => {
    // A second bank whose consent expired: its holdings are unknown, but
    // the first bank's new position must still be honoured.
    const [other] = await db
      .insert(accounts)
      .values({
        userId: baseline.userId,
        name: "Outra corretora",
        accountType: "INVESTMENT",
        balance: 0,
      })
      .returning();
    await db.insert(bankConnections).values({
      userId: baseline.userId,
      itemId: "item-2",
      connectorName: "Outro banco",
      investmentAccountId: other!.id,
    });
    holdingReported = true;
    investment.quantity = 16;
    investment.balance = 640;
    investment.amountOriginal = 480;
    investment.amountProfit = 160;
    await idleSinceAnHour();

    await syncAllBanks();

    expect((await state()).snapshot.holdings[0]?.quantity).toBeCloseTo(16, 9);
  });

  it("stays out of a connection the owner is syncing by hand", async () => {
    transactions.push({
      id: "tx-new",
      accountId: "acct-1",
      date: recentDay,
      description: "Padaria",
      descriptionRaw: null,
      amount: 12,
      currencyCode: "BRL",
      type: "DEBIT",
      status: "POSTED",
      category: "Mercado",
    });
    await db
      .update(bankConnections)
      .set({ lastSyncedAt: new Date() })
      .where(eq(bankConnections.id, connectionId));
    const before = (await state()).spent.length;

    await syncAllBanks();

    expect((await state()).spent).toHaveLength(before);
  });
});
