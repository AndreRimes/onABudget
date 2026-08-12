import "server-only";

import { authEvents } from "./instruments";

/**
 * Better Auth actions we care to see individually. Anything else collapses to
 * "other" so the label stays bounded no matter what the catch-all route is
 * called with.
 */
const ACTIONS = new Set([
  "sign-in/email",
  "sign-up/email",
  "sign-out",
  "get-session",
  "update-user",
  "change-password",
  "forget-password",
  "reset-password",
  "verify-email",
]);

/**
 * Derives auth metrics from the /api/auth response rather than better-auth's
 * `hooks.after`: the hook's `ctx.context.returned` is a Response-or-APIError
 * union from a @better-auth/core internal shape that has already moved between
 * minor versions, and it misses requests rejected before the endpoint router
 * (rate limit, untrusted origin). Records no email, user id or IP.
 *
 * `get-session` dominates volume — it is a useful session-check rate, but
 * filter it out of sign-in panels.
 */
export function recordAuthEvent(req: Request, res: Response): void {
  const raw = new URL(req.url).pathname
    .replace(/^\/api\/auth\/?/, "")
    .replace(/\/+$/, "");

  authEvents.inc({
    action: ACTIONS.has(raw) ? raw : "other",
    outcome: res.status < 400 ? "success" : "failure",
  });
}
