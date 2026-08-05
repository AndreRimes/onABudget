// Client-side parsing of a credit-card bill (fatura) that only exists as text.
// Banco Inter gives pessoa física the fatura as a PDF only — no CSV, no OFX —
// so the input here is whatever text came out of that PDF, either extracted
// with pdf.js or pasted by hand. Both routes land on parseFaturaText().
//
// There is no single layout to rely on, so this is deliberately tolerant:
//  - dates as `03/07`, `03/07/2026`, `03 jul`, `03 jul 2026`, `03 de julho`;
//  - amounts as `45,90`, `R$ 45,90`, `-45,90`, `45,90-`;
//  - a record split across several lines, which is what PDF text extraction
//    usually produces when the bill is laid out as a table.
// Anything it cannot read is counted and sampled rather than silently dropped,
// so the dialog can show it and the parser can be tuned against a real bill.
import { parseBrNumber, stripAccents } from "~/lib/parse";
import type { ParsedStatementRow } from "./statement-row";

const MONTHS: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

/**
 * Summary/header rows that carry a date and an amount but are not purchases.
 * Matched against the accent-stripped, uppercased description.
 */
const NOISE_PATTERNS = [
  "TOTAL",
  "VENCIMENTO",
  "LIMITE",
  "SALDO ANTERIOR",
  "FATURA ANTERIOR",
  "SUBTOTAL",
  "RESUMO",
  "PROXIMA FATURA",
  "LANCAMENTOS",
  "COMPRAS PARCELADAS",
  "DEMONSTRATIVO",
  // Boleto / ficha de compensação block printed after the transactions.
  "USO DO BANCO",
  "VALOR DO DOCUMENTO",
  "NOSSO NUMERO",
  "FICHA DE COMPENSACAO",
  "AUTENTICACAO",
  "BENEFICIARIO",
  "LOCAL DE PAGAMENTO",
  "INSTRUCOES",
  "CARTEIRA",
];

/** Lines that represent money paid *to* the card, not spending. */
const PAYMENT_PATTERNS = [
  "PAGAMENTO",
  "PAGTO",
  "ESTORNO",
  "CREDITO RECEBIDO",
  "DEVOLUCAO",
];

export interface FaturaParseResult {
  rows: ParsedStatementRow[];
  ignoredRows: number;
  /** Lines that looked like transactions but could not be read. */
  unparsedSamples: string[];
  /** `YYYY-MM` the bill belongs to, used to resolve dates without a year. */
  referenceMonth: string | null;
}

/** Leading date of a record: `03/07`, `03 jul`, `03 de julho`, with optional year. */
const DATE_HEAD =
  /^\s*(\d{1,2})\s*(?:\/|-|\.|\s+de\s+|\s+)\s*(\d{1,2}|[a-zç]{3,9})\.?(?:\s*(?:\/|-|\.|\s+de\s+|\s+)\s*(\d{2,4}))?\b\s*(.*)$/i;

/**
 * Trailing money on a line. The currency marker is matched as a unit (`R$`,
 * never a lone `R`) — a bare `R?` would eat the last letter of descriptions
 * like "AMAZON BR". The sign is deliberately NOT part of this pattern; see
 * isCreditAmount().
 */
const TRAILING_AMOUNT =
  /(?:^|\s)(?:(?:R\$|\$)\s*)?(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}|-?\d+\.\d{2})\s*(-)?\s*$/;

/**
 * Direction of a fatura line.
 *
 * Inter prints an empty "Beneficiário" column as a lone `-` immediately before
 * the value, so a spaced dash there is a column artifact, NOT a minus sign —
 * reading it as one turns every purchase into a refund. A credit is marked
 * with `+` instead ("P AGAMENTO ON LINE  -  + R$ 1.220,21"). A dash *after*
 * the number, or attached to the digits, is still honoured since other issuers
 * use those to mean negative.
 */
function isCreditAmount(
  prefix: string,
  numberText: string,
  trailingDash: boolean,
): boolean {
  return (
    prefix.trimEnd().endsWith("+") || trailingDash || numberText.startsWith("-")
  );
}

function monthNumber(raw: string): number | null {
  if (/^\d+$/.test(raw)) {
    const value = Number(raw);
    return value >= 1 && value <= 12 ? value : null;
  }
  const key = stripAccents(raw).toLowerCase().slice(0, 3);
  return MONTHS[key] ?? null;
}

function isNoise(description: string): boolean {
  const upper = stripAccents(description).toUpperCase();
  return NOISE_PATTERNS.some((pattern) => upper.includes(pattern));
}

/**
 * PDF text extraction often splits a word's first letter off ("PAGAMENTO"
 * comes out as "P AGAMENTO"), so keyword matching is done against the
 * space-stripped description. The stored description keeps the original text.
 */
function isPayment(description: string): boolean {
  const squashed = stripAccents(description).toUpperCase().replace(/\s+/g, "");
  return PAYMENT_PATTERNS.some((pattern) =>
    squashed.includes(pattern.replace(/\s+/g, "")),
  );
}

/** Finds the bill's own month, used for records whose date omits the year. */
function findReferenceMonth(text: string): string | null {
  const head = text.slice(0, 4000);
  const explicit =
    /vencimento\D{0,20}(\d{1,2})\D(\d{1,2})\D(\d{4})/i.exec(head) ??
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(head);
  if (explicit) {
    const month = Number(explicit[2]);
    if (month >= 1 && month <= 12) {
      return `${explicit[3]}-${String(month).padStart(2, "0")}`;
    }
  }
  const named = /\b([a-zç]{3,9})\.?\s*(?:de\s*)?(\d{4})\b/i.exec(head);
  if (named) {
    const month = monthNumber(named[1]!);
    if (month) return `${named[2]}-${String(month).padStart(2, "0")}`;
  }
  return null;
}

/**
 * Resolves a day/month against the bill's reference month. A bill closed in
 * January still lists December purchases, so a month ahead of the reference is
 * read as belonging to the previous year.
 */
function resolveDate(
  day: number,
  month: number,
  explicitYear: number | null,
  referenceMonth: string | null,
): string | null {
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;

  let year = explicitYear;
  if (year !== null && year < 100) year += 2000;

  if (year === null) {
    const referenceYear = referenceMonth
      ? Number(referenceMonth.slice(0, 4))
      : new Date().getFullYear();
    const referenceMonthNumber = referenceMonth
      ? Number(referenceMonth.slice(5, 7))
      : new Date().getMonth() + 1;
    year = month > referenceMonthNumber ? referenceYear - 1 : referenceYear;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * PDF text extraction detaches the first glyph of some words, so the bill
 * yields "P AGAMENTO ON LINE" and "P ARKSHOPPING". Rejoining is restricted to
 * *consonants* because a, e and o are real one-letter words in Portuguese —
 * "O BOTICARIO" and "A CASA" must survive untouched.
 */
function rejoinSplitInitials(text: string): string {
  return text.replace(/\b([BCDFGHJKLMNPQRSTVWXYZ])\s+([A-Z]{3,})/g, "$1$2");
}

function cleanDescription(raw: string): string {
  return rejoinSplitInitials(raw.replace(/\s{2,}/g, " "))
    .replace(/[.\-–—+\s]+$/, "")
    .trim();
}

export function parseFaturaText(text: string): FaturaParseResult {
  const referenceMonth = findReferenceMonth(text);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const rows: ParsedStatementRow[] = [];
  const unparsedSamples: string[] = [];
  let ignoredRows = 0;

  // A record starts at a leading date and ends at the line carrying its
  // amount, which may be the same line or a later one (PDF table extraction
  // frequently splits them).
  let pending:
    | {
        day: number;
        month: number;
        year: number | null;
        parts: string[];
        /**
         * How many further lines this record may consume while looking for its
         * amount. A real transaction carries it on the same line, or one or two
         * lines later when the PDF splits the table cells. Without a budget, a
         * stray dated line — the boleto's "30/06/2026 05311988126 OUTROS N ..." —
         * swallows the rest of the document and emits the boleto total as a
         * bogus purchase.
         */
        budget: number;
      }
    | null = null;

  const flush = (prefix: string, numberText: string, trailingDash: boolean) => {
    if (!pending) return;
    const date = resolveDate(pending.day, pending.month, pending.year, referenceMonth);
    const amount = parseBrNumber(numberText);
    const description = cleanDescription(pending.parts.join(" "));
    pending = null;

    if (!date || amount === null || amount === 0) {
      ignoredRows++;
      return;
    }
    if (!description || isNoise(description)) {
      ignoredRows++;
      return;
    }

    const credit =
      isCreditAmount(prefix, numberText, trailingDash) || isPayment(description);
    rows.push({
      // A fatura lists spending; the exceptions are payments and refunds,
      // which are credits and never become expenses.
      kind: credit ? "credit" : "debit",
      date,
      amount: Math.abs(amount),
      description,
      fitId: null,
      acctId: null,
    });
  };

  for (const line of lines) {
    const amountMatch = TRAILING_AMOUNT.exec(line);
    const dateMatch = DATE_HEAD.exec(line);

    if (dateMatch) {
      const day = Number(dateMatch[1]);
      const month = monthNumber(dateMatch[2]!);
      if (month !== null && day >= 1 && day <= 31) {
        // A previous record never found its amount — give up on it.
        if (pending) {
          if (pending.parts.length > 0) {
            unparsedSamples.push(pending.parts.join(" ").slice(0, 120));
          }
          ignoredRows++;
        }
        const rest = dateMatch[4] ?? "";
        pending = {
          day,
          month,
          year: dateMatch[3] ? Number(dateMatch[3]) : null,
          parts: [],
          budget: 3,
        };
        // Match the amount against `rest`, not the whole line: the offsets of
        // a match on the line would be shifted by the date prefix and would
        // slice the description in the wrong place.
        const restAmount = TRAILING_AMOUNT.exec(rest);
        if (restAmount) {
          const prefix = rest.slice(0, restAmount.index);
          pending.parts.push(prefix.trim());
          flush(prefix, restAmount[1]!, !!restAmount[2]);
        } else if (rest) {
          pending.parts.push(rest);
        }
        continue;
      }
    }

    if (pending) {
      if (amountMatch) {
        const before = line.slice(0, amountMatch.index);
        if (before.trim()) pending.parts.push(before.trim());
        flush(before, amountMatch[1]!, !!amountMatch[2]);
        continue;
      }
      if (pending.budget > 0) {
        pending.budget--;
        pending.parts.push(line);
        continue;
      }
      // Budget exhausted: this was never a transaction.
      if (unparsedSamples.length < 8 && pending.parts.length > 0) {
        unparsedSamples.push(pending.parts.join(" ").slice(0, 120));
      }
      ignoredRows++;
      pending = null;
    }
    // Lines that never started with a date are summary/boiler-plate (limits,
    // instalment simulations, the boleto block) and are not reported: every
    // real purchase line begins with its date.
  }

  if (pending) ignoredRows++;

  return { rows, ignoredRows, unparsedSamples, referenceMonth };
}
