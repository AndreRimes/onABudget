// Client-side parsing of bank/credit-card statements exported as a
// spreadsheet (CSV or xlsx). Unlike the B3 reports there is no single known
// layout, so columns are auto-detected by header name and the caller can
// override the guess with an explicit mapping when detection fails.
import * as XLSX from "xlsx";
import {
  asString,
  decodeUtf8OrCp1252,
  normalizeHeader,
  parseBrDate,
  parseBrNumber,
} from "~/lib/parse";
import type { ParsedStatementRow, StatementParseResult } from "./statement-row";

export interface ColumnMapping {
  /** Original (un-normalized) header keys, as they appear in the file. */
  date: string;
  amount: string;
  description: string;
}

export type SpreadsheetParseResult =
  | { status: "ok"; result: StatementParseResult; mapping: ColumnMapping }
  /** Auto-detection failed — the UI asks the user to pick the columns. */
  | { status: "needs-mapping"; headers: string[]; sampleRows: string[][] };

// Header candidates in priority order, normalized (accent- and case-free).
const DATE_HEADERS = [
  "data",
  "date",
  "data lancamento",
  "data do lancamento",
  "data de lancamento",
  "data movimento",
  "data da compra",
  "data compra",
  "data transacao",
];
const AMOUNT_HEADERS = [
  "valor",
  "value",
  "amount",
  "valor (r$)",
  "valor r$",
  "valor brl",
  "quantia",
  "montante",
];
const DESCRIPTION_HEADERS = [
  "descricao",
  "description",
  "historico",
  "lancamento",
  "estabelecimento",
  "memo",
  "title",
  "detalhes",
  "movimentacao",
  "transacao",
];
const TYPE_HEADERS = [
  "tipo",
  "entrada/saida",
  "debito/credito",
  "d/c",
  "tipo de lancamento",
];

/**
 * Picks the first header whose normalized name matches a candidate exactly,
 * falling back to a substring match (so "Data do Lançamento" still resolves
 * even if the exact phrasing isn't listed).
 */
function detectColumn(
  headers: string[],
  candidates: string[],
): string | undefined {
  const normalized = headers.map((h) => [h, normalizeHeader(h)] as const);
  for (const candidate of candidates) {
    const exact = normalized.find(([, norm]) => norm === candidate);
    if (exact) return exact[0];
  }
  for (const candidate of candidates) {
    const partial = normalized.find(([, norm]) => norm.includes(candidate));
    if (partial) return partial[0];
  }
  return undefined;
}

function sheetRecords(
  workbook: XLSX.WorkBook,
  raw: boolean,
): Record<string, unknown>[] {
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Planilha vazia");
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets[sheetName]!,
    { defval: null, raw },
  );
}

/**
 * Reads the workbook into records.
 *
 * Real xlsx/xls files are binary and carry typed cells, so SheetJS is left to
 * do the typing. CSVs are handled by hand instead, because letting SheetJS
 * decode them goes wrong twice over for Brazilian exports: it assumes cp1252
 * (mangling UTF-8 headers like "Histórico") and it coerces cells with US
 * locale rules, reading `03/07/2026` as 3 July -> March 7 and `-45,90` as
 * -4590. Decoding explicitly and keeping cells raw hands both jobs to
 * parseBrDate / parseBrNumber, which know the BR conventions.
 */
function readRecords(buffer: ArrayBuffer): Record<string, unknown>[] {
  const bytes = new Uint8Array(buffer);
  const isXlsx = bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK" zip container
  const isLegacyXls = bytes[0] === 0xd0 && bytes[1] === 0xcf; // OLE compound

  if (isXlsx || isLegacyXls) {
    return sheetRecords(
      XLSX.read(buffer, { type: "array", cellDates: true }),
      false,
    );
  }

  const text = decodeUtf8OrCp1252(bytes);
  const readCsv = (fieldSeparator?: string) =>
    sheetRecords(
      XLSX.read(text, { type: "string", raw: true, FS: fieldSeparator }),
      true,
    );

  // SheetJS guesses the delimiter but can land on a single fat column when the
  // file is semicolon-separated, so that case is retried explicitly.
  const records = readCsv();
  const headerCount = records[0] ? Object.keys(records[0]).length : 0;
  if (headerCount <= 1) {
    const retry = readCsv(";");
    if ((retry[0] ? Object.keys(retry[0]).length : 0) > headerCount) {
      return retry;
    }
  }
  return records;
}

/** Renders any cell as short text for the column-mapping preview table. */
function previewCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

export function parseStatementSpreadsheet(
  buffer: ArrayBuffer,
  mapping?: ColumnMapping,
): SpreadsheetParseResult {
  const records = readRecords(buffer);
  if (records.length === 0) {
    throw new Error("Nenhuma linha encontrada na planilha");
  }

  const headers = Object.keys(records[0]!);
  const dateCol = mapping?.date ?? detectColumn(headers, DATE_HEADERS);
  const amountCol = mapping?.amount ?? detectColumn(headers, AMOUNT_HEADERS);
  const descCol =
    mapping?.description ?? detectColumn(headers, DESCRIPTION_HEADERS);

  if (!dateCol || !amountCol || !descCol) {
    return {
      status: "needs-mapping",
      headers,
      sampleRows: records
        .slice(0, 5)
        .map((record) => headers.map((header) => previewCell(record[header]))),
    };
  }

  const typeCol = detectColumn(headers, TYPE_HEADERS);

  // First pass: coerce every row, so the sign convention can be decided from
  // the file as a whole before committing to a direction.
  const parsed = records.map((record) => ({
    date: parseBrDate(record[dateCol]),
    amount: parseBrNumber(record[amountCol]),
    description: asString(record[descCol]).replace(/\s+/g, " ").trim(),
    type: typeCol ? normalizeHeader(asString(record[typeCol])) : "",
  }));

  // If nothing is negative there is no sign to read (a credit-card bill lists
  // every purchase as a positive number), so every row is a debit unless an
  // explicit type column says otherwise.
  const hasNegatives = parsed.some((row) => (row.amount ?? 0) < 0);

  const rows: ParsedStatementRow[] = [];
  let ignoredRows = 0;

  for (const row of parsed) {
    if (!row.date || row.amount === null || row.amount === 0) {
      ignoredRows++;
      continue;
    }

    let kind: "debit" | "credit";
    if (row.type.startsWith("credito") || row.type.startsWith("entrada")) {
      kind = "credit";
    } else if (row.type.startsWith("debito") || row.type.startsWith("saida")) {
      kind = "debit";
    } else {
      kind = hasNegatives ? (row.amount < 0 ? "debit" : "credit") : "debit";
    }

    rows.push({
      kind,
      date: row.date,
      amount: Math.abs(row.amount),
      description: row.description || "(sem descrição)",
      // Spreadsheets carry no stable transaction id, so dedup falls back to
      // the date/amount/description hash.
      fitId: null,
      acctId: null,
    });
  }

  return {
    status: "ok",
    result: { rows, ignoredRows, institution: "" },
    mapping: { date: dateCol, amount: amountCol, description: descCol },
  };
}
