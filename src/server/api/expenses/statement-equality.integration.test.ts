// The expense chain end to end: a bank file goes in one side, and the numbers
// the Conta Corrente page prints come out the other. What is asserted here is
// equality with the file — the total written, the total queried back, and the
// total the dashboard's grouped query reports all have to be the one figure the
// statement says was spent.
//
// This is the seam the existing tests never crossed: statement-import is tested
// from hand-built row objects, so a transaction lost between the file and the
// ledger would not have failed anything.
import { beforeAll, describe, expect, it, vi } from "vitest";

import { parseOfx } from "~/components/sections/expense/ofx-parser";
import { seedBaseline, type TestDb } from "~/test/db";

vi.mock("~/server/db", async () => {
  const { createTestDb } = await import("~/test/db");
  return { db: await createTestDb() };
});

const { db } = (await import("~/server/db")) as unknown as { db: TestDb };
const { expenses } = await import("~/server/db/schema");
const { importStatementRows, previewStatementRows } =
  await import("./statement-import");
const { getAllExpensesByAccount, getMonthlyExpenseSummary } =
  await import("./repository");

let baseline: Awaited<ReturnType<typeof seedBaseline>>;

beforeAll(async () => {
  baseline = await seedBaseline(db);
});

interface Transaction {
  date: string;
  amount: string;
  fitId: string;
  memo: string;
}

/** An OFX 1.x statement, the dialect every Brazilian bank exports. */
function ofx(transactions: Transaction[]): ArrayBuffer {
  const body = transactions
    .map(
      (transaction) => `<STMTTRN>
<TRNTYPE>OTHER
<DTPOSTED>${transaction.date}
<TRNAMT>${transaction.amount}
<FITID>${transaction.fitId}
<MEMO>${transaction.memo}
</STMTTRN>`,
    )
    .join("\n");

  const text = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<SIGNONMSGSRSV1><SONRS><FI><ORG>Banco Inter</ORG></FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><ACCTID>0001234567</ACCTID></BANKACCTFROM>
<BANKTRANLIST>
${body}
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;
  return new TextEncoder().encode(text).buffer;
}

/**
 * Runs the real user flow: parse the file, preview it, file every new row under
 * the seeded category, import. Mirrors what StatementPreviewPanel submits.
 */
async function importStatement(
  buffer: ArrayBuffer,
  options: { ignore?: (description: string) => boolean } = {},
) {
  const parsed = parseOfx(buffer);
  const preview = await previewStatementRows(
    baseline.userId,
    parsed.rows,
    parsed.institution,
  );

  const categoryByHash: Record<string, number> = {};
  const ignoredHashes: string[] = [];
  for (const entry of preview.rows) {
    if (!entry.hash) continue;
    if (options.ignore?.(entry.row.description)) {
      ignoredHashes.push(entry.hash);
      continue;
    }
    if (entry.status === "new")
      categoryByHash[entry.hash] = baseline.categoryId;
  }

  const result = await importStatementRows({
    userId: baseline.userId,
    accountId: baseline.checkingAccountId,
    categoryByHash,
    pluggyCategoryHashes: [],
    ignoredHashes,
    rows: parsed.rows,
  });

  return { parsed, preview, result };
}

/** Everything the ledger holds for the seeded checking account, in reais. */
async function ledgerTotal(): Promise<number> {
  const rows = await db.select().from(expenses);
  return rows.reduce((sum, row) => sum + row.amount, 0);
}

const AUGUST: Transaction[] = [
  {
    date: "20260803",
    amount: "-104.25",
    fitId: "S1",
    memo: "BELLAVIA SUPERMERCADOS",
  },
  {
    date: "20260805",
    amount: "-21.25",
    fitId: "S2",
    memo: "ANCAR GESTAO DE EMP",
  },
  { date: "20260807", amount: "-3.85", fitId: "S3", memo: "IOF INTERNACIONAL" },
  {
    date: "20260810",
    amount: "-1500.00",
    fitId: "S4",
    memo: "ALUGUEL APARTAMENTO",
  },
  { date: "20260812", amount: "4200.00", fitId: "S5", memo: "SALARIO EMPRESA" },
  {
    date: "20260815",
    amount: "-40.00",
    fitId: "S6",
    memo: "PIX ENVIADO LUCAS ROCHA",
  },
  {
    date: "20260820",
    amount: "-980.00",
    fitId: "S7",
    memo: "PAGAMENTO FATURA CARTAO",
  },
];

/** The five debits that are actually spending: not the salary, not the fatura. */
const SPENDING_TOTAL = 104.25 + 21.25 + 3.85 + 1500 + 40;
const AUGUST_RANGE = { startDate: "2026-08-01", endDate: "2026-08-31" };

describe("statement import equality", () => {
  it("writes exactly what the file says was spent", async () => {
    const { parsed, result } = await importStatement(ofx(AUGUST));

    // Conservation first: every row of the file is accounted for as either
    // written or deliberately skipped. Any other arithmetic would be a row
    // that silently vanished.
    expect(result.inserted + result.skipped).toBe(parsed.rows.length);
    // The salary (credit) and the card-bill payment are the two skips.
    expect(result).toEqual({ inserted: 5, skipped: 2 });

    // And the money matches the file to the cent.
    expect(await ledgerTotal()).toBeCloseTo(SPENDING_TOTAL, 2);
  });

  it("shows the same total on the page the user reads", async () => {
    // The ledger being right is not enough: the number rendered on Conta
    // Corrente comes from a different query, over a date range, through two
    // joins. That one has to agree with the file as well.
    const rows = await getAllExpensesByAccount(
      baseline.userId,
      baseline.checkingAccountId,
      AUGUST_RANGE,
    );

    const pageTotal = rows.reduce((sum, row) => sum + row.expenses.amount, 0);
    expect(pageTotal).toBeCloseTo(SPENDING_TOTAL, 2);
    expect(rows).toHaveLength(5);
  });

  it("shows the same total on the dashboard's grouped query", async () => {
    // A third, independent path to the same figure: the dashboard sums per
    // month and category in SQL rather than shipping rows to the browser.
    const summary = await getMonthlyExpenseSummary(
      baseline.userId,
      AUGUST_RANGE,
    );

    const dashboardTotal = summary.reduce((sum, row) => sum + row.total, 0);
    expect(dashboardTotal).toBeCloseTo(SPENDING_TOTAL, 2);
    expect(summary.every((row) => row.month === "2026-08")).toBe(true);
  });

  it("does not move a number when the same file is imported again", async () => {
    // Re-importing a statement is routine — the windows overlap every time.
    const before = await ledgerTotal();
    const { parsed, result } = await importStatement(ofx(AUGUST));

    expect(result).toEqual({ inserted: 0, skipped: parsed.rows.length });
    expect(await ledgerTotal()).toBeCloseTo(before, 2);
  });

  it("adds only the new rows when the next statement overlaps the last", async () => {
    // The real shape of a second sync: the same window plus a few days more.
    const overlapping = ofx([
      ...AUGUST,
      {
        date: "20260828",
        amount: "-59.90",
        fitId: "S8",
        memo: "FARMACIA PAGUE MENOS",
      },
      {
        date: "20260830",
        amount: "-12.50",
        fitId: "S9",
        memo: "PADARIA CENTRAL",
      },
    ]);

    const { result } = await importStatement(overlapping);

    expect(result.inserted).toBe(2);
    expect(await ledgerTotal()).toBeCloseTo(SPENDING_TOTAL + 59.9 + 12.5, 2);
  });

  it("keeps a row the user chose to ignore out of the total", async () => {
    // An explicit "ignore" is a decision, not a loss: it must be counted as a
    // skip and must not change the money.
    const before = await ledgerTotal();
    const { parsed, result } = await importStatement(
      ofx([
        {
          date: "20260901",
          amount: "-2000.00",
          fitId: "T1",
          memo: "TRANSFERENCIA POUPANCA",
        },
        {
          date: "20260902",
          amount: "-88.00",
          fitId: "T2",
          memo: "MERCADO BOM PRECO",
        },
      ]),
      { ignore: (description) => description.includes("POUPANCA") },
    );

    expect(result).toEqual({ inserted: 1, skipped: 1 });
    expect(result.inserted + result.skipped).toBe(parsed.rows.length);
    expect(await ledgerTotal()).toBeCloseTo(before + 88, 2);
  });

  it("skips a row with no category instead of writing it uncategorized", async () => {
    const parsed = parseOfx(
      ofx([
        {
          date: "20260905",
          amount: "-31.00",
          fitId: "U1",
          memo: "SEM CATEGORIA DEFINIDA",
        },
      ]),
    );
    const before = await ledgerTotal();

    const result = await importStatementRows({
      userId: baseline.userId,
      accountId: baseline.checkingAccountId,
      categoryByHash: {},
      pluggyCategoryHashes: [],
      ignoredHashes: [],
      rows: parsed.rows,
    });

    expect(result).toEqual({ inserted: 0, skipped: 1 });
    expect(await ledgerTotal()).toBeCloseTo(before, 2);
  });

  it("remembers the category chosen for a merchant, for the next import", async () => {
    // The import above filed "BELLAVIA SUPERMERCADOS" under the seeded
    // category. A new purchase at the same merchant, previewed later, has to
    // come back already suggested — that rule is written in a batch after the
    // import, and a batch that silently wrote nothing would only show up here.
    const parsed = parseOfx(
      ofx([
        {
          date: "20260915",
          amount: "-77.70",
          fitId: "W1",
          memo: "BELLAVIA SUPERMERCADOS",
        },
      ]),
    );
    const preview = await previewStatementRows(
      baseline.userId,
      parsed.rows,
      parsed.institution,
    );

    expect(preview.rows[0]).toMatchObject({
      status: "new",
      suggestedCategoryId: baseline.categoryId,
    });
  });

  it("keeps two identical purchases on the same day as two expenses", async () => {
    // The opposite failure to double-importing: real duplicate charges exist,
    // and collapsing them would understate the month.
    const before = await ledgerTotal();
    const { result } = await importStatement(
      ofx([
        {
          date: "20260910",
          amount: "-19.90",
          fitId: "V1",
          memo: "ESTACIONAMENTO SHOPPING",
        },
        {
          date: "20260910",
          amount: "-19.90",
          fitId: "V2",
          memo: "ESTACIONAMENTO SHOPPING",
        },
      ]),
    );

    expect(result.inserted).toBe(2);
    expect(await ledgerTotal()).toBeCloseTo(before + 39.8, 2);
  });
});
