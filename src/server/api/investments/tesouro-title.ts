// Pure helpers shared by the B3 importer (client) and the Tesouro price cache
// (server) to derive one canonical Tesouro Direto title key. Both sides MUST
// produce the exact same string for a given title, so the normalization lives
// here and nowhere else. No server-only imports — safe to bundle on the client.

/** Uppercase, strip accents, collapse whitespace. Deterministic and stable. */
export function normalizeTesouroTitleKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining accents
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** True when a B3 product name denotes a Tesouro Direto title. */
export function isTesouroProduct(product: string): boolean {
  return /^\s*tesouro\b/i.test(product);
}

/**
 * CSV side: the official dataset splits the title into "Tipo Titulo" (no year)
 * and a maturity date, so rebuild the same key the importer stores from the
 * B3 product name ("Tesouro <descriptor> <year>").
 */
export function tesouroTitleKeyFromParts(tipo: string, year: string): string {
  return normalizeTesouroTitleKey(`${tipo} ${year}`);
}
