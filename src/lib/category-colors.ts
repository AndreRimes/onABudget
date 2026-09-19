/**
 * Colours for categories nobody picked a colour for — the ones an import
 * creates on its own from the provider's label. They are read in two places:
 * the badge in the transactions table (as text and border on the page
 * background) and the slices of the donut, so every entry has to stay legible
 * on both the cream and the dark theme. Mid-tone hues do; pastels and near
 * blacks do not.
 */
const CATEGORY_PALETTE = [
  "#F97316", // orange
  "#0EA5E9", // sky
  "#8B5CF6", // violet
  "#EF4444", // red
  "#14B8A6", // teal
  "#EC4899", // pink
  "#6366F1", // indigo
  "#65A30D", // lime
  "#F59E0B", // amber
  "#06B6D4", // cyan
  "#D946EF", // fuchsia
  "#A16207", // bronze
  "#059669", // emerald
  "#BE123C", // rose
] as const;

/**
 * The palette entry used least often among `used`, ties broken by palette
 * order. Colours are what tells one slice of the donut from the next, so a new
 * category takes a hue its owner does not already have — hashing the name
 * instead would hand out duplicates long before the palette ran out.
 */
export function nextCategoryColor(used: Iterable<string>): string {
  const counts = new Map<string, number>(
    CATEGORY_PALETTE.map((color) => [color, 0]),
  );
  for (const color of used) {
    const key = color.toUpperCase();
    const count = counts.get(key);
    // Colours off the palette (seeded ones, anything hand-picked) are not
    // candidates, but they still crowd a hue, so they count against it.
    if (count !== undefined) counts.set(key, count + 1);
  }
  let best: string = CATEGORY_PALETTE[0];
  for (const color of CATEGORY_PALETTE) {
    if (counts.get(color)! < counts.get(best)!) best = color;
  }
  return best;
}

/**
 * A colour derived from the name, for places that have no list of what is
 * already taken — the create-category dialog, which only needs a sane opening
 * value for a field the user can still change. Deterministic, so the field
 * does not flicker through colours while the name is typed.
 */
export function categoryColorFor(name: string): string {
  // djb2 (xor variant). Any stable hash would do; this one is short and
  // spreads the short, similar-prefixed strings ("Transporte",
  // "Transferências") that category names actually are. `Math.imul` and the
  // xor keep it a 32-bit integer without a `| 0` truncation step.
  let hash = 5381;
  const key = name.trim().toLowerCase();
  for (const char of key) {
    hash = Math.imul(hash, 33) ^ char.codePointAt(0)!;
  }
  return CATEGORY_PALETTE[Math.abs(hash) % CATEGORY_PALETTE.length]!;
}
