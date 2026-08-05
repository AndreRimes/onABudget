// Client-side parsing of OFX bank statements (Banco Inter, C6, and essentially
// every Brazilian bank export it). Handles both OFX 1.x — which is SGML, with
// unclosed leaf tags — and OFX 2.x, which is real XML. Both are read the same
// way: aggregates like <STMTTRN> are closed in either dialect, and a leaf value
// is simply the text between its tag and the next '<'.
//
// Parsing stays on the client, matching the B3 importer: the file never leaves
// the browser, only normalized rows do.
import { decodeUtf8OrCp1252 } from "~/lib/parse";
import type { ParsedStatementRow, StatementParseResult } from "./statement-row";

/**
 * OFX 1.x files from Brazilian banks are usually cp1252/latin-1, declared in a
 * plain-text header before the markup starts. Decoding those bytes as UTF-8
 * mangles every accented merchant name, so the header decides the decoder.
 */
function decodeOfx(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  // The header is pure ASCII, so latin1 is always safe for sniffing it.
  const head = new TextDecoder("windows-1252").decode(bytes.slice(0, 1024));

  const declared =
    /^\s*ENCODING:\s*(\S+)/im.exec(head)?.[1] ??
    /^\s*CHARSET:\s*(\S+)/im.exec(head)?.[1] ??
    /<\?xml[^>]*encoding=["']([^"']+)["']/i.exec(head)?.[1];

  const label = declared?.toUpperCase().trim();
  if (label === "UTF-8" || label === "UTF8") {
    return new TextDecoder("utf-8").decode(bytes);
  }
  // Anything else ("USASCII" + "CHARSET:1252", "ISO-8859-1", "LATIN1", or no
  // declaration at all) is sniffed, since files routinely mis-declare.
  return decodeUtf8OrCp1252(bytes);
}

/** Value of a leaf element: everything between the tag and the next '<'. */
function tagValue(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([^<]*)`, "i").exec(block);
  const value = match?.[1]?.trim();
  // An empty element is as good as an absent one for every caller here.
  if (!value) return null;
  return value;
}

/** `20260703120000[-3:BRT]` / `20260703` -> `2026-07-03`. */
function parseOfxDate(raw: string | null): string | null {
  if (!raw) return null;
  const digits = /^(\d{4})(\d{2})(\d{2})/.exec(raw.trim());
  if (!digits) return null;
  const [, year, month, day] = digits;
  const monthNum = Number(month);
  const dayNum = Number(day);
  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) return null;
  return `${year}-${month}-${day}`;
}

/**
 * OFX amounts are meant to be `-45.90`, but Brazilian exporters sometimes emit
 * a comma decimal and/or dot thousands separators.
 */
function parseOfxAmount(raw: string | null): number | null {
  if (!raw) return null;
  let cleaned = raw.replace(/\s/g, "");
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  if (hasComma && hasDot) {
    // Whichever comes last is the decimal separator.
    cleaned =
      cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (hasComma) {
    cleaned = cleaned.replace(",", ".");
  }
  const parsed = Number(cleaned);
  return isNaN(parsed) ? null : parsed;
}

/** Splits the document into <STMTTRN> blocks, tolerating a missing close tag. */
function transactionBlocks(text: string): string[] {
  const blocks: string[] = [];
  const open = /<STMTTRN>/gi;
  let match: RegExpExecArray | null;
  while ((match = open.exec(text)) !== null) {
    const start = match.index + match[0].length;
    const closeIndex = text.slice(start).search(/<\/STMTTRN>/i);
    const nextIndex = text.slice(start).search(/<STMTTRN>/i);
    const end =
      closeIndex >= 0 && (nextIndex < 0 || closeIndex < nextIndex)
        ? start + closeIndex
        : nextIndex >= 0
          ? start + nextIndex
          : text.length;
    blocks.push(text.slice(start, end));
  }
  return blocks;
}

export function parseOfx(buffer: ArrayBuffer): StatementParseResult {
  const text = decodeOfx(buffer);
  if (!/<OFX>/i.test(text)) {
    throw new Error(
      "Arquivo OFX inválido. Baixe o extrato em OFX no Internet Banking (Conta Digital > Extrato > Exportar).",
    );
  }

  const institution = tagValue(text, "ORG") ?? "";
  const acctId = tagValue(text, "ACCTID");

  const blocks = transactionBlocks(text);
  if (blocks.length === 0) {
    throw new Error("Nenhuma transação encontrada no arquivo OFX.");
  }

  const rows: ParsedStatementRow[] = [];
  let ignoredRows = 0;

  for (const block of blocks) {
    const date = parseOfxDate(tagValue(block, "DTPOSTED"));
    const amount = parseOfxAmount(tagValue(block, "TRNAMT"));
    const fitId = tagValue(block, "FITID");
    const memo = tagValue(block, "MEMO") ?? "";
    const name = tagValue(block, "NAME") ?? "";
    // Banks split the merchant across NAME and MEMO inconsistently; the longer
    // of the two is reliably the more descriptive one.
    const description = (memo.length >= name.length ? memo : name).trim();

    if (!date || amount === null || amount === 0) {
      ignoredRows++;
      continue;
    }

    rows.push({
      // The sign of TRNAMT is the authority on direction — TRNTYPE is often
      // just "OTHER" in Brazilian exports.
      kind: amount < 0 ? "debit" : "credit",
      date,
      amount: Math.abs(amount),
      description: description || "(sem descrição)",
      fitId,
      acctId,
    });
  }

  return { rows, ignoredRows, institution };
}
