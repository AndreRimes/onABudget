// Official daily quota values for Brazilian funds, from the CVM's "informe
// diário" open data. This is the only free source that prices a fund held by
// CNPJ, and it is the same class of source as the Tesouro CSV: a public file,
// published once a day, cached forever once read.
//
// Two things shape the code here. The files are monthly ZIPs of a ~50 MB CSV
// carrying every fund in the country, so the entry is inflated as a stream and
// filtered line by line — the full text is never held in memory. And since
// CVM 175 a fund can report as several *subclasses* under one CNPJ, each with
// its own quota, so one of them has to be picked; see `chooseSubclass`.
import { createInflateRaw } from "node:zlib";

import { MarketUpstreamError } from "./brapi";

const CVM_BASE_URL =
  "https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS/inf_diario_fi_";

/** Generous: these are ~10 MB downloads from a government host. */
const CVM_FETCH_TIMEOUT_MS = 120_000;

export interface FundQuotaPoint {
  cnpj: string; // 14 digits, no punctuation
  date: string; // YYYY-MM-DD
  quota: number;
}

/** 14 digits, no punctuation — the key both this module and the DB use. */
export function normalizeCnpj(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** True when a string is a CNPJ, punctuated or not. */
export function isCnpj(raw: string): boolean {
  return normalizeCnpj(raw).length === 14;
}

interface CsvRow {
  date: string;
  subclass: string;
  quota: number;
  netAssets: number;
}

/**
 * Which subclass of a fund the holding is in, when the CNPJ reports more than
 * one.
 *
 * The provider (Pluggy) knows the holding's own quota value but not which
 * subclass produced it, so the subclass whose quota sits closest to it is the
 * one the holding is in — an exact match in practice, since both sides are
 * quoting the same number. Without that reference there is nothing to match
 * on and the largest subclass by net assets is the best available guess.
 *
 * The choice is made once per fund and then applied to every date, so the
 * series can never jump between subclasses mid-chart.
 */
function chooseSubclass(rows: CsvRow[], reference: number | undefined): string {
  const subclasses = new Set(rows.map((row) => row.subclass));
  if (subclasses.size <= 1) return rows[0]?.subclass ?? "";

  const latestDate = rows.reduce(
    (latest, row) => (row.date > latest ? row.date : latest),
    "",
  );
  const latest = rows.filter((row) => row.date === latestDate);

  if (reference !== undefined && reference > 0) {
    let best = latest[0]!;
    let bestDistance = Math.abs(best.quota - reference);
    for (const row of latest) {
      const distance = Math.abs(row.quota - reference);
      if (distance < bestDistance) {
        best = row;
        bestDistance = distance;
      }
    }
    return best.subclass;
  }

  return latest.reduce((biggest, row) =>
    row.netAssets > biggest.netAssets ? row : biggest,
  ).subclass;
}

/** Column positions, read from the header so a reordered file still parses. */
function headerIndexes(header: string) {
  const columns = header.split(";").map((name) => name.trim().toUpperCase());
  const at = (...names: string[]) => {
    for (const name of names) {
      const index = columns.indexOf(name);
      if (index !== -1) return index;
    }
    return -1;
  };
  return {
    // The CVM 175 files renamed the fund column; older ones use CNPJ_FUNDO.
    cnpj: at("CNPJ_FUNDO_CLASSE", "CNPJ_FUNDO"),
    subclass: at("ID_SUBCLASSE"),
    date: at("DT_COMPTC"),
    quota: at("VL_QUOTA"),
    netAssets: at("VL_PATRIM_LIQ"),
  };
}

/**
 * Offset and length of the first `.csv` entry's deflated bytes.
 *
 * Read from the central directory rather than by scanning for local headers:
 * the directory is the authoritative index, and it carries the compressed size
 * so the deflate stream can be sliced exactly instead of being fed the trailing
 * directory bytes.
 */
function locateCsvEntry(
  zip: Buffer,
): { offset: number; compressedSize: number; deflated: boolean } | null {
  // End of central directory: fixed 22-byte record, plus up to 64 KB of
  // comment, so scan backwards over that window only.
  const scanFrom = Math.max(0, zip.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = zip.length - 22; i >= scanFrom; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return null;

  const entries = zip.readUInt16LE(eocd + 10);
  let pointer = zip.readUInt32LE(eocd + 16);

  for (let i = 0; i < entries; i++) {
    if (zip.readUInt32LE(pointer) !== 0x02014b50) return null;
    const method = zip.readUInt16LE(pointer + 10);
    const compressedSize = zip.readUInt32LE(pointer + 20);
    const nameLength = zip.readUInt16LE(pointer + 28);
    const extraLength = zip.readUInt16LE(pointer + 30);
    const commentLength = zip.readUInt16LE(pointer + 32);
    const localOffset = zip.readUInt32LE(pointer + 42);
    const name = zip.toString(
      "latin1",
      pointer + 46,
      pointer + 46 + nameLength,
    );

    if (name.toLowerCase().endsWith(".csv")) {
      // The local header repeats the name and extra fields, and its extra
      // field length can differ from the directory's — so the data offset has
      // to come from the local header itself.
      if (zip.readUInt32LE(localOffset) !== 0x04034b50) return null;
      const localNameLength = zip.readUInt16LE(localOffset + 26);
      const localExtraLength = zip.readUInt16LE(localOffset + 28);
      return {
        offset: localOffset + 30 + localNameLength + localExtraLength,
        compressedSize,
        deflated: method === 8,
      };
    }

    pointer += 46 + nameLength + extraLength + commentLength;
  }

  return null;
}

/** Feed the entry's bytes through inflate, handing back one text line at a time. */
async function readCsvLines(
  zip: Buffer,
  onLine: (line: string) => void,
): Promise<void> {
  const entry = locateCsvEntry(zip);
  if (!entry) throw new MarketUpstreamError("CVM zip has no CSV entry");

  const data = zip.subarray(entry.offset, entry.offset + entry.compressedSize);

  // Stored (uncompressed) entries are legal zip and cost nothing to support.
  if (!entry.deflated) {
    for (const line of data.toString("latin1").split(/\r?\n/)) onLine(line);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const inflate = createInflateRaw();
    // The CSV is latin1 (the CVM has never published it as UTF-8), and only
    // ASCII columns are read out of it anyway.
    let carry = "";

    inflate.on("data", (chunk: Buffer) => {
      carry += chunk.toString("latin1");
      let breakAt = carry.indexOf("\n");
      while (breakAt !== -1) {
        onLine(carry.slice(0, breakAt));
        carry = carry.slice(breakAt + 1);
        breakAt = carry.indexOf("\n");
      }
    });
    inflate.on("end", () => {
      if (carry) onLine(carry);
      resolve();
    });
    inflate.on("error", (error) =>
      reject(
        new MarketUpstreamError(`CVM zip inflate failed: ${error.message}`),
      ),
    );

    inflate.end(data);
  });
}

/**
 * Every published quota for the given funds in one calendar month.
 *
 * `referenceQuotas` maps a CNPJ to the quota value the provider reports for
 * the holding, used only to disambiguate subclasses. Funds the file does not
 * mention simply come back with no points — a fund can be absent from a month
 * it did not exist in, which is not an error.
 */
export async function fetchFundQuotas(input: {
  cnpjs: Set<string>;
  month: string; // YYYY-MM
  fromDate: string; // YYYY-MM-DD, floor
  referenceQuotas?: Map<string, number>;
}): Promise<FundQuotaPoint[]> {
  if (input.cnpjs.size === 0) return [];

  const url = `${CVM_BASE_URL}${input.month.replace("-", "")}.zip`;
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(CVM_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    throw new MarketUpstreamError(`CVM request failed: ${String(error)}`);
  }
  // A month that has not been published yet is a 404, and is not a failure:
  // report it as an empty month so the caller stops asking for it today.
  if (response.status === 404 || response.status === 403) return [];
  if (!response.ok) {
    throw new MarketUpstreamError(
      `CVM request failed with status ${response.status}`,
      response.status,
    );
  }

  const zip = Buffer.from(await response.arrayBuffer());

  const byCnpj = new Map<string, CsvRow[]>();
  let columns: ReturnType<typeof headerIndexes> | null = null;

  await readCsvLines(zip, (line) => {
    if (!line) return;
    if (!columns) {
      columns = headerIndexes(line);
      return;
    }
    // Cheap pre-filter: the vast majority of lines are other funds, and
    // splitting every one of ~500k rows into ten strings is the whole cost of
    // this parse.
    const cells = line.split(";");
    const cnpj = normalizeCnpj(cells[columns.cnpj] ?? "");
    if (!input.cnpjs.has(cnpj)) return;

    const date = (cells[columns.date] ?? "").trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < input.fromDate) return;

    const quota = Number(cells[columns.quota]);
    if (!Number.isFinite(quota) || quota <= 0) return;

    const list = byCnpj.get(cnpj);
    const row: CsvRow = {
      date,
      subclass: (columns.subclass === -1
        ? ""
        : (cells[columns.subclass] ?? "")
      ).trim(),
      quota,
      netAssets: Number(cells[columns.netAssets]) || 0,
    };
    if (list) list.push(row);
    else byCnpj.set(cnpj, [row]);
  });

  const points: FundQuotaPoint[] = [];
  for (const [cnpj, rows] of byCnpj) {
    const subclass = chooseSubclass(rows, input.referenceQuotas?.get(cnpj));
    for (const row of rows) {
      if (row.subclass !== subclass) continue;
      points.push({ cnpj, date: row.date, quota: row.quota });
    }
  }

  return points;
}
