import { NextResponse } from "next/server";

import { client } from "~/server/db";
import { withHttpMetrics } from "~/server/metrics/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;

/**
 * Liveness + DB readiness. Unauthenticated and deliberately free of version or
 * build details, so it is safe to point a container HEALTHCHECK or a blackbox
 * probe at. Distinguishes "process up" from "DB reachable", which Prometheus's
 * own `up` series cannot.
 */
export const GET = withHttpMetrics("/api/health", async () => {
  try {
    await client.execute("select 1");
    return NextResponse.json(
      { status: "ok", uptime: process.uptime() },
      { headers: NO_STORE },
    );
  } catch {
    return NextResponse.json(
      { status: "degraded", db: "unreachable" },
      { status: 503, headers: NO_STORE },
    );
  }
});
