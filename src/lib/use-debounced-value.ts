import { useEffect, useState } from "react";

/**
 * The value as it was `delayMs` ago, settling once typing stops. For inputs
 * that drive a request — a ticker search that reaches an upstream API, a
 * filter over a big list — so the work happens once per pause rather than
 * once per keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
