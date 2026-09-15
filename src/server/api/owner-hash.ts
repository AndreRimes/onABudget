/**
 * Namespaces an import dedup hash by the user it belongs to.
 *
 * `source_hash` is UNIQUE across the whole table, and every importer derives it
 * from the row's content alone (date, ticker, amount…). Without an owner in the
 * key two people who made the same trade on the same day collide: the second
 * import is silently dropped by `onConflictDoNothing`, and the preview tells
 * one user whether another already holds a given row. The prefix makes the
 * key private to its owner; the content part stays exactly as each importer
 * computes it, so their own dedup contract is unchanged.
 *
 * Recurring occurrences (`recurring:{ruleId}:{month}`) are the one hash not
 * passed through here — the rule id is already globally unique.
 */
export function ownerHash(userId: string, hash: string): string {
  return `${userId}:${hash}`;
}
