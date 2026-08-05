// Fuzzy matching of an external institution name to one of the user's own
// accounts. Used by the B3 importer (the report's "Instituição" column) and by
// the bank-statement importer (the OFX <ORG> / bank name), so an import can
// pre-fill the account instead of asking every time.
import { stripAccents } from "~/lib/parse";

function normalizeName(value: string): string {
  return stripAccents(value).toLowerCase().trim();
}

/**
 * Best-effort match of an institution string to one of the given accounts, by
 * shared name token (e.g. "XP INVESTIMENTOS CCTVM S/A" -> an account named
 * "XP"). Returns null when nothing matches confidently.
 */
export function matchAccountId(
  institution: string,
  accounts: Array<{ id: number; name: string }>,
): number | null {
  const inst = normalizeName(institution);
  if (!inst) return null;
  const instTokens = new Set(inst.split(/[^a-z0-9]+/).filter(Boolean));

  let best: { id: number; score: number } | null = null;
  for (const account of accounts) {
    const name = normalizeName(account.name);
    if (!name) continue;
    const nameTokens = name.split(/[^a-z0-9]+/).filter(Boolean);
    // Score = how many of the account's tokens appear in the institution.
    const score = nameTokens.filter(
      (token) =>
        instTokens.has(token) ||
        [...instTokens].some((it) => it.startsWith(token) && token.length >= 3),
    ).length;
    if (score > 0 && (!best || score > best.score)) {
      best = { id: account.id, score };
    }
  }
  return best?.id ?? null;
}
