import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { type NextRequest } from "next/server";

import { env } from "~/env";
import { appRouter } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { withHttpMetrics } from "~/server/metrics/http";

export const dynamic = "force-dynamic";

/**
 * This wraps the `createTRPCContext` helper and provides the required context for the tRPC API when
 * handling a HTTP request (e.g. when you make requests from Client Components).
 */
const createContext = async (req: NextRequest) => {
  return createTRPCContext({
    headers: req.headers,
  });
};

/**
 * The largest legitimate body is a 5000-row statement or B3 preview, well
 * under 2 MB; anything bigger is a mistake or an attempt to make the server
 * parse it. The fetch adapter has no size option of its own, so the declared
 * length is checked before the body is read (a chunked upload without one
 * still ends at the 5000-row cap in the input schemas).
 */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

const handler = (req: NextRequest) => {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) {
    return new Response("Payload Too Large", { status: 413 });
  }
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext(req),
    onError:
      env.NODE_ENV === "development"
        ? ({ path, error }) => {
            console.error(
              `❌ tRPC failed on ${path ?? "<no-path>"}: ${error.message}`,
            );
          }
        : undefined,
  });
};

/**
 * Note: tRPC batches several procedures into one HTTP request, and server
 * components call the router directly via ~/trpc/server (no HTTP at all). So
 * these HTTP counts and trpc_requests_total measure different things and must
 * never be divided by one another.
 */
const instrumented = withHttpMetrics("/api/trpc", (req) =>
  handler(req as NextRequest),
);

export { instrumented as GET, instrumented as POST };
