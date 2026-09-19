/**
 * Pairs each item with a React key derived from its content. Equal items
 * (the same statement line twice in one file, say) get a numbered suffix, so
 * the keys stay unique without falling back to the array index — which would
 * make React reuse the wrong row when the list is filtered or re-sorted.
 */
export function withRenderKeys<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
): { key: string; item: T }[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = keyOf(item);
    const repeat = seen.get(base) ?? 0;
    seen.set(base, repeat + 1);
    return { key: repeat === 0 ? base : `${base}#${repeat}`, item };
  });
}
