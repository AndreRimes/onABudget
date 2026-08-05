// Coercion helpers shared by the spreadsheet importers (B3 reports and bank
// statements). Pure and dependency-free, so they are safe on both sides of the
// wire.

/** Drops combining accents: "Alimentação" -> "Alimentacao" (after casing). */
export function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** Accent-insensitive, case-insensitive key for matching header cells. */
export function normalizeHeader(header: string): string {
  return stripAccents(header).toLowerCase().trim();
}

/**
 * Best-effort date coercion to `YYYY-MM-DD`, covering the three shapes a
 * spreadsheet cell can arrive in: a real Date (when read with `cellDates`), an
 * Excel serial number, or a `DD/MM/YYYY` string.
 */
export function parseBrDate(value: unknown): string | null {
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
    const trimmed = value.trim();
    const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(trimmed);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    // Some exports already use ISO, sometimes with a time suffix.
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  return null;
}

/**
 * Parses money written in either the BR or the US convention, which both turn
 * up in bank exports: "R$ 1.234,56" -> 1234.56, "55.90" -> 55.9, "-" -> null.
 *
 * The only genuinely ambiguous case is a lone dot. It is read as a thousands
 * separator exactly when every group after it is three digits ("1.234" ->
 * 1234), and as a decimal point otherwise ("55.90" -> 55.9) — mis-reading
 * "55.90" as 5590 would be a hundredfold error, so the narrow rule wins.
 */
export function parseBrNumber(value: unknown): number | null {
  if (typeof value === "number") return isNaN(value) ? null : value;
  if (typeof value !== "string") return null;

  let cleaned = value.replace(/R\$\s?/g, "").replace(/\s/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  if (hasComma && hasDot) {
    // Whichever separator comes last is the decimal one.
    cleaned =
      cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (hasComma) {
    cleaned = cleaned.replace(",", ".");
  } else if (hasDot) {
    const parts = cleaned.split(".");
    const grouped =
      parts.length > 1 &&
      parts.slice(1).every((part) => /^\d{3}$/.test(part)) &&
      // "0.500" is a decimal, never five hundred.
      !/^-?0$/.test(parts[0]!);
    if (grouped) cleaned = parts.join("");
  }

  const parsed = Number(cleaned);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Decodes bytes that are probably UTF-8 but might be cp1252/latin-1 — the two
 * encodings Brazilian banks export text files in. Strict UTF-8 decoding throws
 * on any invalid sequence, and accented cp1252 text is essentially never
 * coincidentally valid UTF-8, so a clean decode can be trusted.
 */
export function decodeUtf8OrCp1252(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
