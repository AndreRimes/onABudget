// Client-side parsing of the B3 Área do Investidor reports (xlsx).
// Two layouts are recognized by their headers:
//  - "negociação"  (trades):  Data do Negócio / Tipo de Movimentação /
//     Código de Negociação / Quantidade / Preço / Valor  (renda variável)
//  - "movimentação" (events): Entrada/Saída / Data / Movimentação / Produto /
//     Quantidade / Preço unitário / Valor da Operação. Two row kinds are kept:
//       • proventos  — Rendimento / Dividendo / Juros Sobre Capital Próprio;
//       • aplicações de renda fixa / tesouro direto — Compra / Venda /
//         "Compra / Venda" rows, imported as fixed-income trades.
import * as XLSX from "xlsx";
import {
  isTesouroProduct,
  normalizeTesouroTitleKey,
} from "~/server/api/investments/tesouro-title";

export type ParsedB3Row =
  | {
      kind: "trade";
      date: string;
      ticker: string;
      side: "BUY" | "SELL";
      quantity: number;
      price: number;
      amount: number;
      institution: string;
      isFixedIncome: boolean;
      // Canonical Tesouro Direto title when the product is a Tesouro; drives
      // mark-to-market pricing. Null for stocks/FIIs and other fixed income.
      tesouroTitle: string | null;
    }
  | {
      kind: "income";
      date: string;
      ticker: string;
      type: "DIVIDEND" | "JCP" | "RENDIMENTO";
      amount: number;
      institution: string;
    };

export interface ParseResult {
  reportType: "negociacao" | "movimentacao";
  rows: ParsedB3Row[];
  ignoredRows: number;
}

function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parseBrDate(value: unknown): string | null {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    // Excel serial date: days since 1899-12-30
    const millis = Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000;
    const date = new Date(millis);
    return isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(value.trim());
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  }
  return null;
}

function parseBrNumber(value: unknown): number | null {
  if (typeof value === "number") return isNaN(value) ? null : value;
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/R\$\s?/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  if (cleaned === "" || cleaned === "-") return null;
  const parsed = Number(cleaned);
  return isNaN(parsed) ? null : parsed;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Strip the fractional-market suffix ("PETR4F" → "PETR4"). */
function normalizeTicker(raw: string): string {
  const ticker = raw.trim().toUpperCase();
  return /^[A-Z]{4}\d{1,2}F$/.test(ticker) ? ticker.slice(0, -1) : ticker;
}

const incomeTypeByLabel: Record<string, "DIVIDEND" | "JCP" | "RENDIMENTO"> = {
  rendimento: "RENDIMENTO",
  dividendo: "DIVIDEND",
  "juros sobre capital proprio": "JCP",
};

/**
 * Direction of a fixed-income / tesouro movement in the Movimentação report.
 * B3 labels tesouro buys/sells as "Compra"/"Venda" but renda-fixa ones as the
 * ambiguous "Compra / Venda", so the "Entrada/Saída" column (Crédito = asset
 * in = BUY, Débito = asset out = SELL) is the authority, with the label as a
 * fallback. Returns null for movements that are not buys/sells.
 */
function tradeSide(
  movementLabel: string,
  entradaSaida: string,
): "BUY" | "SELL" | null {
  const isTrade =
    movementLabel === "compra" ||
    movementLabel === "venda" ||
    movementLabel === "compra / venda" ||
    movementLabel === "compra/venda";
  if (!isTrade) return null;
  const flow = normalizeHeader(entradaSaida);
  if (flow.startsWith("credito")) return "BUY";
  if (flow.startsWith("debito")) return "SELL";
  if (movementLabel === "compra") return "BUY";
  if (movementLabel === "venda") return "SELL";
  return null;
}

/**
 * Asset name for a Movimentação-report "Produto", shared by both proventos and
 * fixed-income trades so a provento lands on the same holding as its trade:
 *  - "CDB - CDB2260KFZB - BANCO ORIGINAL S/A" (3+ segments) → the security
 *     code "CDB2260KFZB";
 *  - "PETR4 - PETROBRAS PN" / "MXRF11 - MAXI RENDA FII" (2 segments) → ticker;
 *  - "Tesouro IPCA+ 2050" (1 segment) → the whole name.
 */
function movimentacaoAssetName(product: string): string {
  const parts = product
    .split(" - ")
    .map((part) => part.trim())
    .filter(Boolean);
  const chosen =
    parts.length >= 3 ? parts[1]! : parts.length === 2 ? parts[0]! : product;
  return normalizeTicker(chosen.replace(/\s+/g, " ").trim());
}

export function parseB3Workbook(buffer: ArrayBuffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Planilha vazia");
  const sheet = workbook.Sheets[sheetName]!;
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
  });
  if (records.length === 0) throw new Error("Nenhuma linha encontrada na planilha");

  // Normalized header -> original key of the first record
  const headerMap = new Map<string, string>();
  for (const key of Object.keys(records[0]!)) {
    headerMap.set(normalizeHeader(key), key);
  }
  const col = (name: string): string | undefined => headerMap.get(name);

  if (col("codigo de negociacao")) {
    // ---- Negociação report ------------------------------------------------
    const rows: ParsedB3Row[] = [];
    let ignoredRows = 0;
    for (const record of records) {
      const date = parseBrDate(record[col("data do negocio")!]);
      const rawSide = asString(record[col("tipo de movimentacao")!]);
      const ticker = record[col("codigo de negociacao")!];
      const quantity = parseBrNumber(record[col("quantidade")!]);
      const price = parseBrNumber(record[col("preco")!]);
      const amount = parseBrNumber(record[col("valor")!]);
      const institution = col("instituicao")
        ? asString(record[col("instituicao")!]).trim()
        : "";

      const side = /compra/i.test(rawSide)
        ? "BUY"
        : /venda/i.test(rawSide)
          ? "SELL"
          : null;

      if (!date || !side || typeof ticker !== "string" || !quantity || !amount) {
        ignoredRows++;
        continue;
      }
      rows.push({
        kind: "trade",
        date,
        ticker: normalizeTicker(ticker),
        side,
        quantity,
        price: price ?? amount / quantity,
        amount,
        institution,
        isFixedIncome: false,
        tesouroTitle: null,
      });
    }
    return { reportType: "negociacao", rows, ignoredRows };
  }

  if (col("movimentacao") && col("produto")) {
    // ---- Movimentação report ---------------------------------------------
    const entradaCol = col("entrada/saida");
    const quantidadeCol = col("quantidade");
    const precoCol = col("preco unitario");
    const rows: ParsedB3Row[] = [];
    let ignoredRows = 0;
    for (const record of records) {
      const movementLabel = normalizeHeader(
        asString(record[col("movimentacao")!]),
      );
      const date = parseBrDate(record[col("data")!]);
      const product = record[col("produto")!];
      const amount = parseBrNumber(record[col("valor da operacao")!]);
      const institution = col("instituicao")
        ? asString(record[col("instituicao")!]).trim()
        : "";

      // Proventos (rendimento / dividendo / JCP) → dividend rows.
      const incomeType = incomeTypeByLabel[movementLabel];
      if (incomeType) {
        if (!date || typeof product !== "string" || !amount) {
          ignoredRows++;
          continue;
        }
        rows.push({
          kind: "income",
          date,
          ticker: movimentacaoAssetName(product),
          type: incomeType,
          amount,
          institution,
        });
        continue;
      }

      // Renda fixa / tesouro direto buys and sells → fixed-income trade rows.
      const side = tradeSide(
        movementLabel,
        entradaCol ? asString(record[entradaCol]) : "",
      );
      if (side) {
        const quantity = quantidadeCol
          ? parseBrNumber(record[quantidadeCol])
          : null;
        const price = precoCol ? parseBrNumber(record[precoCol]) : null;
        if (!date || typeof product !== "string" || !quantity || !amount) {
          ignoredRows++;
          continue;
        }
        rows.push({
          kind: "trade",
          date,
          ticker: movimentacaoAssetName(product),
          side,
          quantity,
          price: price ?? amount / quantity,
          amount,
          institution,
          isFixedIncome: true,
          tesouroTitle: isTesouroProduct(product)
            ? normalizeTesouroTitleKey(product)
            : null,
        });
        continue;
      }

      ignoredRows++;
    }
    return { reportType: "movimentacao", rows, ignoredRows };
  }

  throw new Error(
    "Formato não reconhecido. Use o relatório de Negociação ou de Movimentação da Área do Investidor da B3.",
  );
}
