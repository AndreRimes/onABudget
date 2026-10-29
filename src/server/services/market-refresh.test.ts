import { expect, it, vi } from "vitest";
import { MarketRefreshQueue } from "./market-refresh";

it("shares equivalent jobs and serializes overlapping automatic/manual refreshes", async () => {
  const queue = new MarketRefreshQueue();
  let release!: () => void;
  const job = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const first = queue.run("auto:user", job);
  expect(queue.run("auto:user", job)).toBe(first);
  const manual = vi.fn(async () => "manual");
  const second = queue.run("manual:user", manual);
  await Promise.resolve();
  expect(job).toHaveBeenCalledOnce();
  expect(manual).not.toHaveBeenCalled();
  release();
  await first;
  expect(await second).toBe("manual");
});

it("releases the queue after failures so the next request can recover", async () => {
  const queue = new MarketRefreshQueue();
  const failed = queue.run("user", async () => {
    throw new Error("offline");
  });
  await expect(failed).rejects.toThrow("offline");
  expect(await queue.run("user", async () => "recovered")).toBe("recovered");
});
