import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "~/server/better-auth";
import { recordAuthEvent } from "~/server/metrics/auth";
import { withHttpMetrics } from "~/server/metrics/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const handlers = toNextJsHandler(auth.handler);

export const GET = withHttpMetrics("/api/auth", handlers.GET, recordAuthEvent);
export const POST = withHttpMetrics(
  "/api/auth",
  handlers.POST,
  recordAuthEvent,
);
