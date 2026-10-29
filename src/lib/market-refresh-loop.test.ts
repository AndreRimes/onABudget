import { afterEach, expect, it, vi } from "vitest";
import { startMarketRefreshLoop } from "./market-refresh-loop";

afterEach(() => vi.useRealTimers());

it("refreshes progressively, honors server backoff, and pauses in hidden tabs", async () => {
  vi.useFakeTimers();
  let visible = true;
  const refresh = vi.fn(async () => 90_000);
  const loop = startMarketRefreshLoop({
    refresh,
    isVisible: () => visible,
    initiallyDue: true,
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(refresh).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(refresh).toHaveBeenCalledOnce();
  visible = false;
  loop.onVisibility();
  await vi.advanceTimersByTimeAsync(120_000);
  expect(refresh).toHaveBeenCalledOnce();
  visible = true;
  loop.onVisibility();
  await vi.advanceTimersByTimeAsync(0);
  expect(refresh).toHaveBeenCalledTimes(2);
  loop.dispose();
  await vi.advanceTimersByTimeAsync(120_000);
  expect(refresh).toHaveBeenCalledTimes(2);
});

it("does not overlap requests or schedule another after unmount", async () => {
  vi.useFakeTimers();
  let finish!: (delay: number) => void;
  const refresh = vi.fn(
    () =>
      new Promise<number>((resolve) => {
        finish = resolve;
      }),
  );
  const loop = startMarketRefreshLoop({
    refresh,
    isVisible: () => true,
    initiallyDue: true,
  });
  await vi.advanceTimersByTimeAsync(0);
  loop.retry();
  loop.onVisibility();
  await vi.advanceTimersByTimeAsync(120_000);
  expect(refresh).toHaveBeenCalledOnce();
  loop.dispose();
  finish(60_000);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(refresh).toHaveBeenCalledOnce();
});

it("waits before checking fresh data and retries failures no faster than once a minute", async () => {
  vi.useFakeTimers();
  const refresh = vi.fn(async () => {
    throw new Error("offline");
  });
  const loop = startMarketRefreshLoop({
    refresh,
    isVisible: () => true,
    initiallyDue: false,
  });
  await vi.advanceTimersByTimeAsync(59_999);
  expect(refresh).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(refresh).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(refresh).toHaveBeenCalledTimes(2);
  loop.dispose();
});
