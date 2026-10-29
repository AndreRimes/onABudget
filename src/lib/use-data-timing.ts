"use client";

import { useEffect, useRef } from "react";

/** Browser Performance marks, with no financial values or account identifiers. */
export function useDataTiming(
  page: "dashboard" | "investments" | "asset",
  ready: boolean,
) {
  const started = useRef<number | null>(null);
  const recorded = useRef(false);
  useEffect(() => {
    started.current ??= performance.now();
    if (!ready || recorded.current) return;
    recorded.current = true;
    performance.mark(`onabudget:${page}:data-ready`);
    performance.measure(`onabudget:${page}:mount-to-data`, {
      start: started.current,
      end: performance.now(),
    });
  }, [page, ready]);
}
