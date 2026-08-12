/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";

import { auth } from "~/server/better-auth";
import { db } from "~/server/db";
import {
  trpcRequestDuration,
  trpcRequestsInFlight,
  trpcRequestsTotal,
} from "~/server/metrics/instruments";
import { withUpstreamFanoutScope } from "~/server/metrics/upstream";

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 *
 * @see https://trpc.io/docs/server/context
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await auth.api.getSession({
    headers: opts.headers,
  });
  return {
    db,
    session,
    ...opts,
  };
};

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/**
 * Records Prometheus metrics for every procedure, and adds an artificial delay
 * in development.
 *
 * The dev delay simulates network latency that would occur in production but
 * not locally, which helps catch unwanted waterfalls. It is applied *before*
 * the timer starts so the fake latency doesn't dominate dev histograms.
 */
const metricsMiddleware = t.middleware(async ({ next, path, type }) => {
  if (t._config.isDev) {
    const waitMs = Math.floor(Math.random() * 400) + 100;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const labels = { procedure: path, type };
  const stop = trpcRequestDuration.startTimer(labels);
  trpcRequestsInFlight.inc({ type });

  try {
    // Scope outbound provider calls to this procedure, so we can measure how
    // many brapi/BCB requests one procedure costs (see ~/server/metrics/upstream).
    const result = await withUpstreamFanoutScope(path, () => next());

    // tRPC catches downstream errors and returns them as `{ ok: false, error }`
    // rather than throwing, so the result must be inspected — a try/catch alone
    // would record every failed procedure as a success.
    trpcRequestsTotal.inc({
      ...labels,
      code: result.ok ? "OK" : result.error.code,
    });

    return result;
  } catch (cause) {
    // Defensive: reaching here means this middleware itself failed.
    trpcRequestsTotal.inc({ ...labels, code: "INTERNAL_SERVER_ERROR" });
    throw cause;
  } finally {
    stop();
    trpcRequestsInFlight.dec({ type });
  }
});

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure.use(metricsMiddleware);

/**
 * Protected (authenticated) procedure
 *
 * If you want a query or mutation to ONLY be accessible to logged in users, use this. It verifies
 * the session is valid and guarantees `ctx.session.user` is not null.
 *
 * @see https://trpc.io/docs/procedures
 */
// metricsMiddleware runs before the session check on purpose, so rejected calls
// are counted with code="UNAUTHORIZED" rather than disappearing.
export const protectedProcedure = t.procedure
  .use(metricsMiddleware)
  .use(({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    return next({
      ctx: {
        // infers the `session` as non-nullable
        session: { ...ctx.session, user: ctx.session.user },
      },
    });
  });
