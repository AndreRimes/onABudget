import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { env } from "~/env";
import { registry } from "~/server/metrics";
// Side-effect import: constructs the scrape-time business gauges. Without it
// they are never registered and never appear in the output.
import "~/server/metrics/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;

function tokenMatches(header: string | null, expected: string): boolean {
  const prefix = "Bearer ";
  if (!header?.startsWith(prefix)) return false;

  const given = Buffer.from(header.slice(prefix.length));
  const want = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, so check that first.
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function GET(req: Request) {
  if (!env.METRICS_TOKEN) {
    // Fail closed: never expose metrics unauthenticated in production. 503
    // rather than 401 says "the operator forgot to set the token", not "your
    // token is wrong" — pair it with an alert on `up == 0`.
    if (env.NODE_ENV === "production") {
      console.error(
        "[metrics] METRICS_TOKEN is not set; refusing to serve metrics",
      );
      return new NextResponse(
        "Metrics disabled: METRICS_TOKEN is not configured",
        { status: 503, headers: NO_STORE },
      );
    }
    // dev/test: allow unauthenticated scraping for local debugging.
  } else if (
    !tokenMatches(req.headers.get("authorization"), env.METRICS_TOKEN)
  ) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { ...NO_STORE, "WWW-Authenticate": "Bearer" },
    });
  }

  const body = await registry.metrics();

  return new NextResponse(body, {
    status: 200,
    headers: { ...NO_STORE, "Content-Type": registry.contentType },
  });
}
