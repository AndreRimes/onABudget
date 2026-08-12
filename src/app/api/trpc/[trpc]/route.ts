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

const handler = (req: NextRequest) =>
  fetchRequestHandler({
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
