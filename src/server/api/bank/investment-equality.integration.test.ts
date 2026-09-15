// The investment chain end to end: what the bank reports goes in, and what the
// Investimentos page shows comes out. Every existing test stops at a module
// boundary — the importer is exercised from already-normalized rows, the engine
// from hand-built transactions — and the bug that shipped (fund positions ~98%
// short) lived exactly in the seam between them.
//
// The contract asserted here is the one that matters: for every holding the
// bank reports, the ledger's quantity is *its* quantity, and priced with the
// bank's own quota the app's value and gain are the bank's figures to the cent.
// Anything the app cannot reproduce has to be reported by reconcileHoldings
// rather than quietly absorbed.
import { beforeAll, describe, expect, it, vi } from "vitest";

import { investment, movement } from "~/test/pluggy";
import { seedBaseline, type TestDb } from "~/test/db";
import type {
  PluggyInvestment,
  PluggyInvestmentTransaction,
} from "~/server/services/pluggy";
import type { CandlePoint } from "~/server/services/brapi";
import type { QuoteResult } from "~/server/services/market-cache";
import type { EngineTransaction } from "~/server/api/investments/portfolio-engine";

// Typed, so the mock factory hands back the real shapes rather than `any` —
// the payload is the subject of these tests and has to typecheck like one.
const listInvestments =
  vi.fn<(itemId: string) => Promise<PluggyInvestment[]>>();
const listInvestmentTransactions =
  vi.fn<(investmentId: string) => Promise<PluggyInvestmentTransaction[]>>();

vi.mock("~/server/services/pluggy", () => ({
  listInvestments: (itemId: string) => listInvestments(itemId),
  listInvestmentTransactions: (investmentId: string) =>
    listInvestmentTransactions(investmentId),
  listAccounts: vi.fn(),
  listTransactions: vi.fn(),
  getItem: vi.fn(),
}));

vi.mock("~/server/db", async () => {
  const { createTestDb } = await import("~/test/db");
  return { db: await createTestDb() };
});

const { db } = (await import("~/server/db")) as unknown as { db: TestDb };
const { bankConnections, investmentTransactions, providerHoldings } =
  await import("~/server/db/schema");
const { fetchConnectionInvestmentRows } = await import("./sync");
const { importPluggyInvestmentRows, previewPluggyInvestmentRows } =
  await import("./investment-import");
const { computePortfolioSnapshot } =
  await import("~/server/api/investments/portfolio-engine");
const { reconcileHoldings } =
  await import("~/server/api/investments/reconcile");

let baseline: Awaited<ReturnType<typeof seedBaseline>>;
let connectionId: number;

/** Every price in the payload is as of this day, so nothing accrues past it. */
const TODAY = "2026-06-30";

beforeAll(async () => {
  baseline = await seedBaseline(db);
  const [connection] = await db
    .insert(bankConnections)
    .values({
      userId: baseline.userId,
      provider: "pluggy",
      itemId: "item-equality",
      connectorName: "XP Investimentos",
      investmentAccountId: baseline.investmentAccountId,
    })
    .returning();
  connectionId = connection!.id;
});

/* ---------------------------------------------------------------- payload -- */

/**
 * One holding of each kind that is priced differently: a share and a fund
 * quoted from a market source, and a CDB the app has to model because no
 * provider gives a daily price for one.
 *
 * Every `balance` is exactly `quantity × value`, every `amountOriginal` is
 * exactly what the movements below paid, and `amountProfit` is the difference —
 * which is what makes "equal to the bank" a statement with no wiggle room.
 */
const HOLDINGS: PluggyInvestment[] = [
  investment({
    id: "inv-petr",
    name: "PETROBRAS PN",
    code: "PETR4",
    type: "EQUITY",
    subtype: "STOCK",
    quantity: 100,
    value: 38.5,
    balance: 3850,
    amount: 3850,
    amountOriginal: 3000,
    amountProfit: 850,
    date: TODAY,
  }),
  investment({
    id: "inv-hglg",
    name: "CSHG LOGISTICA FII",
    code: "HGLG11",
    type: "EQUITY",
    subtype: "REAL_ESTATE_FUND",
    quantity: 30,
    value: 150,
    balance: 4500,
    amount: 4500,
    amountOriginal: 4200,
    amountProfit: 300,
    date: TODAY,
  }),
  investment({
    id: "inv-fund",
    name: "Genoa Capital Radar Advisory CIC Multimercado RL",
    code: "36.017.731/0001-97",
    type: "MUTUAL_FUND",
    subtype: "MULTIMARKET_FUND",
    quantity: 500,
    value: 2.5,
    balance: 1250,
    amount: 1250,
    amountOriginal: 1000,
    amountProfit: 250,
    date: TODAY,
  }),
  investment({
    id: "inv-cdb",
    name: "CDB - BANCO EXEMPLO S.A.",
    code: "CDB2260KFZB",
    type: "FIXED_INCOME",
    subtype: "CDB",
    quantity: 1,
    value: 1000,
    balance: 1000,
    amount: 1000,
    amountOriginal: 1000,
    amountProfit: 0,
    date: TODAY,
  }),
];

/** The movements that add up, exactly, to each holding above. */
const MOVEMENTS: Record<string, PluggyInvestmentTransaction[]> = {
  "inv-petr": [
    movement({
      id: "m-petr-1",
      quantity: 60,
      value: 30,
      amount: 1800,
      tradeDate: "2026-01-12",
    }),
    movement({
      id: "m-petr-2",
      quantity: 40,
      value: 30,
      amount: 1200,
      tradeDate: "2026-02-10",
    }),
  ],
  "inv-hglg": [
    movement({
      id: "m-hglg-1",
      quantity: 30,
      value: 140,
      amount: 4200,
      tradeDate: "2026-01-20",
    }),
  ],
  "inv-fund": [
    movement({
      id: "m-fund-1",
      quantity: 500,
      value: 2,
      amount: 1000,
      tradeDate: "2026-02-02",
    }),
  ],
  "inv-cdb": [
    movement({
      id: "m-cdb-1",
      quantity: 1,
      value: 1000,
      amount: 1000,
      tradeDate: "2026-03-01",
    }),
  ],
};

const PROVIDER_TOTAL = 3850 + 4500 + 1250 + 1000;

function keyOf(held: PluggyInvestment): string {
  return held.code ?? held.name;
}

/* ------------------------------------------------------------------ flow -- */

/** Runs the sync the way the dialog does: fetch, preview, import. */
async function sync(
  holdings: PluggyInvestment[],
  movements: Record<string, PluggyInvestmentTransaction[]>,
  options: { includePositions?: boolean } = {},
) {
  listInvestments.mockResolvedValue(holdings);
  listInvestmentTransactions.mockImplementation((id: string) =>
    Promise.resolve(movements[id] ?? []),
  );

  const fetched = await fetchConnectionInvestmentRows({
    userId: baseline.userId,
    connectionId,
  });

  const rows = options.includePositions
    ? [...fetched.rows, ...fetched.positions]
    : fetched.rows;
  const preview = await previewPluggyInvestmentRows(baseline.userId, rows);

  const result = await importPluggyInvestmentRows({
    userId: baseline.userId,
    investmentAccountId: baseline.investmentAccountId,
    // Every asset is filed under the seeded type: what is under test is the
    // arithmetic, not the type picker.
    assetTypeByAsset: Object.fromEntries(
      holdings.map((held) => [keyOf(held), baseline.assetTypeId]),
    ),
    pluggyTypeAssets: [],
    rows,
  });

  return { fetched, preview, result };
}

/** The ledger, as the engine consumes it. */
async function ledger(): Promise<EngineTransaction[]> {
  const rows = await db.select().from(investmentTransactions);
  return rows.map((row) => ({
    assetName: row.assetName,
    assetTypeId: row.assetTypeId,
    transactionType: row.transactionType,
    quantity: row.quantity,
    totalAmount: row.totalAmount,
    transactionDate: row.transactionDate.slice(0, 10),
    isFixedIncome: row.isFixedIncome ?? false,
    fixedIncomeYieldType: row.fixedIncomeYieldType,
    fixedIncomeRate: row.fixedIncomeRate,
    fixedIncomeMaturityDate: row.fixedIncomeMaturityDate,
    tesouroTitle: row.tesouroTitle,
    fundCnpj: row.fundCnpj,
  }));
}

/**
 * The portfolio as the page renders it, priced with the provider's *own*
 * figures. Using the bank's quota here is the point: it takes the price source
 * out of the comparison, so what is left under test is the app's arithmetic.
 */
async function portfolio(priceOverrides: Record<string, number> = {}) {
  const priceOf = (held: PluggyInvestment) =>
    priceOverrides[keyOf(held)] ?? held.value!;

  const quotes = new Map<string, QuoteResult>();
  const fundCandles = new Map<string, CandlePoint[]>();
  for (const held of HOLDINGS) {
    const price = priceOf(held);
    if (held.type === "MUTUAL_FUND") {
      fundCandles.set(keyOf(held), [{ date: TODAY, close: price }]);
    } else if (held.type !== "FIXED_INCOME") {
      quotes.set(keyOf(held), {
        price,
        previousClose: price,
        status: "ok",
        asOf: new Date(`${TODAY}T21:00:00.000Z`),
      });
    }
  }

  return computePortfolioSnapshot({
    transactions: await ledger(),
    dividends: [],
    assetTypeNames: new Map([[baseline.assetTypeId, "Ações"]]),
    assetLabels: new Map(),
    quotes,
    candles: new Map(),
    tesouroCandles: new Map(),
    fundCandles,
    benchmarks: new Map(),
    range: "max",
    today: TODAY,
    includeSeries: false,
  });
}

/** What the bank said, as the reconciliation consumes it. */
async function providerFacts() {
  const rows = await db.select().from(providerHoldings);
  return rows.map((row) => ({
    assetName: row.assetName,
    quantity: row.quantity,
    value: row.value,
    profit: row.profit,
    syncedAt: row.syncedAt,
  }));
}

/* ----------------------------------------------------------------- tests -- */

describe("investment sync equality", () => {
  it("imports every movement the provider returned", async () => {
    const { result } = await sync(HOLDINGS, MOVEMENTS);
    expect(result).toEqual({ inserted: 5, skipped: 0 });
  });

  it("holds exactly the quantity the bank reports, per asset", async () => {
    // The invariant with no acceptable excuse. This is the one that was broken.
    const snapshot = await portfolio();

    for (const held of HOLDINGS) {
      const holding = snapshot.holdings.find(
        (entry) => entry.assetName === keyOf(held),
      );
      expect(
        holding,
        `${keyOf(held)} missing from the portfolio`,
      ).toBeDefined();
      expect(holding!.quantity).toBeCloseTo(held.quantity!, 8);
    }
  });

  it("values each holding at the bank's figure, to the cent", async () => {
    const snapshot = await portfolio();

    for (const held of HOLDINGS) {
      const holding = snapshot.holdings.find(
        (entry) => entry.assetName === keyOf(held),
      )!;
      expect(holding.currentValue).toBeCloseTo(held.balance, 2);
    }
    expect(snapshot.summary.totalValue).toBeCloseTo(PROVIDER_TOTAL, 2);
  });

  it("reports the same gain the bank reports", async () => {
    // "Rendeu o mesmo": the cost basis the ledger derives from the movements
    // has to be the amount the bank says was applied, or the gain is fiction.
    const snapshot = await portfolio();

    for (const held of HOLDINGS) {
      const holding = snapshot.holdings.find(
        (entry) => entry.assetName === keyOf(held),
      )!;
      expect(holding.totalCost).toBeCloseTo(held.amountOriginal!, 2);
      expect(holding.unrealizedGain).toBeCloseTo(held.amountProfit!, 2);
    }
  });

  it("reconciles clean against what the sync recorded", async () => {
    const reconciliation = reconcileHoldings(
      (await portfolio()).holdings,
      await providerFacts(),
    );

    expect(reconciliation.mismatches).toEqual([]);
    expect(reconciliation.difference).toBeCloseTo(0, 2);
    expect(reconciliation.appTotal).toBeCloseTo(PROVIDER_TOTAL, 2);
    expect(reconciliation.providerTotal).toBeCloseTo(PROVIDER_TOTAL, 2);
  });

  it("moves no number when the same sync runs again", async () => {
    const before = await portfolio();
    const { preview, result } = await sync(HOLDINGS, MOVEMENTS);

    expect(result).toEqual({ inserted: 0, skipped: 5 });
    // previewPluggyInvestmentRows returns the rows themselves, not a wrapper.
    expect(preview.every((row) => row.status === "duplicate")).toBe(true);

    const after = await portfolio();
    expect(after.summary.totalValue).toBeCloseTo(before.summary.totalValue, 8);
    expect(after.holdings.map((holding) => holding.quantity)).toEqual(
      before.holdings.map((holding) => holding.quantity),
    );
  });

  it("attributes a price difference to the price, not to the position", async () => {
    // The difference that is *not* a defect: the app prices a fund on the last
    // published CVM quota, the bank on its own day. It still has to be named.
    const snapshot = await portfolio({ "36.017.731/0001-97": 2.6 });
    const reconciliation = reconcileHoldings(
      snapshot.holdings,
      await providerFacts(),
    );

    expect(reconciliation.mismatches).toHaveLength(1);
    expect(reconciliation.mismatches[0]).toMatchObject({
      assetName: "36.017.731/0001-97",
      cause: "price",
    });
    // 500 quotas × R$0,10 of quota difference.
    expect(reconciliation.mismatches[0]!.difference).toBeCloseTo(50, 2);
  });
});

describe("a holding older than the provider's history window", () => {
  // The bug that shipped: the connector serves ~12 months of movements, so a
  // fund bought before that returns only its recent ones and the ledger ends up
  // holding a fraction of the real position.
  const partial = investment({
    id: "inv-ace",
    name: "ACE Capital Advisory FIF CIC Multi RL",
    code: "34.774.642/0001-60",
    type: "MUTUAL_FUND",
    subtype: "MULTIMARKET_FUND",
    quantity: 800,
    value: 2,
    balance: 1600,
    amount: 1600,
    amountOriginal: 1000,
    amountProfit: 600,
    date: TODAY,
  });
  const partialMovements = {
    "inv-ace": [
      movement({
        id: "m-ace-1",
        quantity: 20,
        value: 1.9,
        amount: 38,
        tradeDate: "2026-05-04",
      }),
    ],
  };

  async function acePortfolio() {
    return computePortfolioSnapshot({
      transactions: await ledger(),
      dividends: [],
      assetTypeNames: new Map([[baseline.assetTypeId, "Ações"]]),
      assetLabels: new Map(),
      quotes: new Map(),
      candles: new Map(),
      tesouroCandles: new Map(),
      fundCandles: new Map([
        ["34.774.642/0001-60", [{ date: TODAY, close: 2 }]],
      ]),
      benchmarks: new Map(),
      range: "max",
      today: TODAY,
      includeSeries: false,
    });
  }

  it("is reported as short by exactly the quantity that is missing", async () => {
    await sync([partial], partialMovements);

    const holdings = (await acePortfolio()).holdings.filter(
      (holding) => holding.assetName === "34.774.642/0001-60",
    );
    const facts = (await providerFacts()).filter(
      (fact) => fact.assetName === "34.774.642/0001-60",
    );
    const reconciliation = reconcileHoldings(holdings, facts);

    expect(reconciliation.mismatches).toHaveLength(1);
    expect(reconciliation.mismatches[0]).toMatchObject({
      cause: "quantity",
      appQuantity: 20,
      providerQuantity: 800,
    });
    // 780 quotas at R$2,00 that the app would otherwise have shown as missing
    // money with no explanation.
    expect(reconciliation.mismatches[0]!.difference).toBeCloseTo(-1560, 2);
  });

  it("reconciles clean once the reconstructed position is imported", async () => {
    // The shortfall position carries the cost the bank reported for the part
    // the history does not cover, so the position matches without inventing a
    // basis.
    await sync([partial], partialMovements, { includePositions: true });

    const holdings = (await acePortfolio()).holdings.filter(
      (holding) => holding.assetName === "34.774.642/0001-60",
    );
    const facts = (await providerFacts()).filter(
      (fact) => fact.assetName === "34.774.642/0001-60",
    );

    expect(holdings[0]!.quantity).toBeCloseTo(800, 8);
    expect(holdings[0]!.currentValue).toBeCloseTo(1600, 2);
    expect(reconcileHoldings(holdings, facts).mismatches).toEqual([]);
  });
});
