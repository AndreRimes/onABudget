import "server-only";

import { httpRequestDuration, httpRequestsInFlight } from "./instruments";

type RouteHandler<TArgs extends unknown[]> = (
  req: Request,
  ...args: TArgs
) => Response | Promise<Response>;

/**
 * Wraps a Next.js route handler with duration/in-flight metrics.
 *
 * `route` must be a static pattern hardcoded at the call site ("/api/trpc",
 * "/api/auth", ...) — deriving it from req.url would make the label unbounded.
 *
 * `observe` is an optional hook for route-specific counters (see ./auth); it
 * runs only when the handler returned a response.
 */
export function withHttpMetrics<TArgs extends unknown[]>(
  route: string,
  handler: RouteHandler<TArgs>,
  observe?: (req: Request, res: Response) => void,
): RouteHandler<TArgs> {
  return async (req, ...args) => {
    const stop = httpRequestDuration.startTimer({ method: req.method, route });
    httpRequestsInFlight.inc({ route });

    // If the handler throws, Next answers 500 — so leaving this at 500 records
    // what the client actually saw.
    let status = 500;

    try {
      const res = await handler(req, ...args);
      status = res.status;
      observe?.(req, res);
      return res;
    } finally {
      stop({ status: String(status) });
      httpRequestsInFlight.dec({ route });
    }
  };
}
