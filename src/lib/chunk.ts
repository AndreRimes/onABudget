/**
 * Split an array into fixed-size chunks.
 *
 * Used by the importers to batch inserts: SQLite binds one parameter per
 * column per row, and a single statement covering a whole 5000-row file would
 * blow past the variable limit. Chunking keeps each statement well inside it
 * while still replacing thousands of round trips with a handful.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error("chunk size must be at least 1");
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
