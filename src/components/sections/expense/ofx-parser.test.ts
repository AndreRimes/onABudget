// The bank's file is the source of truth, and this parser is where it enters
// the app. Everything downstream — dedup, categorisation, the totals on the
// Conta Corrente page — is arithmetic on what comes out of here, so a
// transaction lost at this step is a number that can never be right again.
//
// The files are synthesized rather than committed: no real statement enters the
// repository, and a test that builds its own bytes can state exactly what the
// file contains, which is what makes "the sum matches" meaningful.
import { describe, expect, it } from "vitest";

import { parseOfx } from "./ofx-parser";

interface Transaction {
  type?: string;
  date: string;
  amount: string;
  fitId: string;
  memo?: string;
  name?: string;
}

/** OFX 1.x: SGML, leaf tags never closed — what Inter, C6 and Itaú export. */
function ofx1(transactions: Transaction[], acctId = "0001234567"): string {
  const body = transactions
    .map((transaction) =>
      [
        "<STMTTRN>",
        `<TRNTYPE>${transaction.type ?? "OTHER"}`,
        `<DTPOSTED>${transaction.date}`,
        `<TRNAMT>${transaction.amount}`,
        `<FITID>${transaction.fitId}`,
        transaction.name ? `<NAME>${transaction.name}` : "",
        transaction.memo ? `<MEMO>${transaction.memo}` : "",
        "</STMTTRN>",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");

  return `OFXHEADER:100
DATA:OFXSGML
VERSION:102
ENCODING:USASCII
CHARSET:1252

<OFX>
<SIGNONMSGSRSV1><SONRS><FI><ORG>Banco Inter</ORG></FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><ACCTID>${acctId}</ACCTID></BANKACCTFROM>
<BANKTRANLIST>
${body}
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;
}

/** OFX 2.x: real XML, every tag closed. */
function ofx2(transactions: Transaction[]): string {
  const body = transactions
    .map(
      (transaction) => `<STMTTRN>
<TRNTYPE>${transaction.type ?? "OTHER"}</TRNTYPE>
<DTPOSTED>${transaction.date}</DTPOSTED>
<TRNAMT>${transaction.amount}</TRNAMT>
<FITID>${transaction.fitId}</FITID>
<MEMO>${transaction.memo ?? ""}</MEMO>
</STMTTRN>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="200"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><ACCTID>987654</ACCTID></BANKACCTFROM>
<BANKTRANLIST>
${body}
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
}

function utf8(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

/** Encodes as cp1252, the charset OFX 1.x files from Brazilian banks declare. */
function cp1252(text: string): ArrayBuffer {
  const CP1252_HIGH: Record<string, number> = {
    "€": 0x80,
    "‘": 0x91,
    "’": 0x92,
    "–": 0x96,
  };
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index++) {
    const code = text.codePointAt(index)!;
    // Latin-1 maps 1:1 onto cp1252 above 0xA0, which covers every accent a
    // Brazilian merchant name uses.
    bytes[index] = code < 256 ? code : (CP1252_HIGH[text[index]!] ?? 0x3f);
  }
  return bytes.buffer;
}

const STATEMENT: Transaction[] = [
  {
    date: "20260803",
    amount: "-104.25",
    fitId: "A1",
    memo: "BELLAVIA SUPERMERCADOS",
  },
  {
    date: "20260805",
    amount: "-21.25",
    fitId: "A2",
    memo: "ANCAR GESTAO DE EMP",
  },
  { date: "20260807", amount: "-3.85", fitId: "A3", memo: "IOF INTERNACIONAL" },
  { date: "20260810", amount: "-1500.00", fitId: "A4", memo: "ALUGUEL" },
  { date: "20260812", amount: "4200.00", fitId: "A5", memo: "SALARIO" },
  {
    date: "20260815",
    amount: "-40.00",
    fitId: "A6",
    memo: "PIX ENVIADO - LUCAS",
  },
];

/** What the file says was spent: the figure everything else has to reproduce. */
const DEBIT_TOTAL = 104.25 + 21.25 + 3.85 + 1500 + 40;

describe("parseOfx", () => {
  it("returns every transaction the file contains", () => {
    const result = parseOfx(utf8(ofx1(STATEMENT)));

    // Conservation: a row is either understood or counted as ignored. Anything
    // else is a transaction that disappeared between the bank and the app.
    expect(result.rows.length + result.ignoredRows).toBe(STATEMENT.length);
    expect(result.rows).toHaveLength(STATEMENT.length);
    expect(result.rows.map((row) => row.fitId)).toEqual([
      "A1",
      "A2",
      "A3",
      "A4",
      "A5",
      "A6",
    ]);
  });

  it("sums the debits to exactly what the file says was spent", () => {
    const result = parseOfx(utf8(ofx1(STATEMENT)));

    const total = result.rows
      .filter((row) => row.kind === "debit")
      .reduce((sum, row) => sum + row.amount, 0);

    expect(total).toBeCloseTo(DEBIT_TOTAL, 2);
  });

  it("keeps credits, flagged, instead of dropping them", () => {
    // A salary is not an expense, but silently discarding it at parse time
    // would leave the user unable to tell "recognised and skipped" from "lost".
    const credits = parseOfx(utf8(ofx1(STATEMENT))).rows.filter(
      (row) => row.kind === "credit",
    );

    expect(credits).toHaveLength(1);
    expect(credits[0]).toMatchObject({ amount: 4200, description: "SALARIO" });
  });

  it("reads the direction from the amount's sign, not from TRNTYPE", () => {
    // Brazilian exports routinely label everything "OTHER".
    const result = parseOfx(
      utf8(
        ofx1([
          {
            type: "OTHER",
            date: "20260803",
            amount: "-10.00",
            fitId: "B1",
            memo: "SAIDA",
          },
          {
            type: "OTHER",
            date: "20260803",
            amount: "10.00",
            fitId: "B2",
            memo: "ENTRADA",
          },
        ]),
      ),
    );

    expect(result.rows.map((row) => row.kind)).toEqual(["debit", "credit"]);
    expect(result.rows.every((row) => row.amount === 10)).toBe(true);
  });

  it("counts a malformed transaction as ignored rather than swallowing it", () => {
    const result = parseOfx(
      utf8(
        ofx1([
          ...STATEMENT,
          { date: "", amount: "-99.99", fitId: "BAD1", memo: "SEM DATA" },
          {
            date: "20260820",
            amount: "0.00",
            fitId: "BAD2",
            memo: "VALOR ZERO",
          },
        ]),
      ),
    );

    expect(result.ignoredRows).toBe(2);
    expect(result.rows.length + result.ignoredRows).toBe(STATEMENT.length + 2);
    // And the ignored ones contribute nothing to the money.
    const total = result.rows
      .filter((row) => row.kind === "debit")
      .reduce((sum, row) => sum + row.amount, 0);
    expect(total).toBeCloseTo(DEBIT_TOTAL, 2);
  });

  it("parses the XML dialect to the same rows as the SGML one", () => {
    const sgml = parseOfx(utf8(ofx1(STATEMENT)));
    const xml = parseOfx(utf8(ofx2(STATEMENT)));

    expect(xml.rows.map((row) => ({ ...row, acctId: null }))).toEqual(
      sgml.rows.map((row) => ({ ...row, acctId: null })),
    );
  });

  it("keeps accented merchant names intact from a cp1252 file", () => {
    // Decoding these bytes as UTF-8 mangles the name, and a mangled description
    // is a different dedup key — the same purchase would import twice.
    const result = parseOfx(
      cp1252(
        ofx1([
          {
            date: "20260803",
            amount: "-35.90",
            fitId: "C1",
            memo: "PADARIA SÃO JOÃO",
          },
          {
            date: "20260804",
            amount: "-12.00",
            fitId: "C2",
            memo: "AÇAÍ DA PRAÇA",
          },
        ]),
      ),
    );

    expect(result.rows.map((row) => row.description)).toEqual([
      "PADARIA SÃO JOÃO",
      "AÇAÍ DA PRAÇA",
    ]);
  });

  it("carries the ids that make dedup exact", () => {
    const result = parseOfx(utf8(ofx1(STATEMENT, "0009999")));

    expect(result.institution).toBe("Banco Inter");
    expect(result.rows.every((row) => row.acctId === "0009999")).toBe(true);
    expect(result.rows[0]?.fitId).toBe("A1");
  });

  it("reads the comma decimals some exporters emit", () => {
    const result = parseOfx(
      utf8(
        ofx1([
          {
            date: "20260803",
            amount: "-1.234,56",
            fitId: "D1",
            memo: "COM MILHAR",
          },
          {
            date: "20260804",
            amount: "-45,90",
            fitId: "D2",
            memo: "SO VIRGULA",
          },
        ]),
      ),
    );

    expect(result.rows.map((row) => row.amount)).toEqual([1234.56, 45.9]);
  });

  it("refuses a file that is not an OFX statement", () => {
    expect(() => parseOfx(utf8("<html><body>login</body></html>"))).toThrow(
      /OFX inválido/,
    );
  });
});
