import { expect, it, vi } from "vitest";

vi.mock("~/server/better-auth", () => ({ auth: { api: {} } }));
vi.mock("~/server/db", () => ({ db: {} }));

import { db } from "~/server/db";
import { trpcRequestsTotal } from "~/server/metrics/instruments";
import { createTRPCRouter, publicProcedure } from "./trpc";

it("records request metrics without adding simulated latency", async () => {
  const router = createTRPCRouter({
    performanceCheck: publicProcedure.query(() => "ok"),
  });
  const caller = router.createCaller({
    db,
    session: null,
    headers: new Headers(),
  });
  const timer = vi.spyOn(globalThis, "setTimeout");
  try {
    expect(await caller.performanceCheck()).toBe("ok");
    expect(timer).not.toHaveBeenCalled();
    const metrics = await trpcRequestsTotal.get();
    const metric = metrics.values.find(
      (entry) => entry.labels.procedure === "performanceCheck",
    );
    expect(metric?.value).toBe(1);
    expect(metric?.labels).toMatchObject({ type: "query", code: "OK" });
  } finally {
    timer.mockRestore();
  }
});
