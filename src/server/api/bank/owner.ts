// Access gate for every Open Finance surface.
//
// Meu Pluggy's free tier is licensed for personal use with your own accounts,
// so this is a licence boundary rather than a preference: exactly one account
// may see or use the bank sync, and everybody else must not even learn that it
// exists.
import { TRPCError } from "@trpc/server";

import { env } from "~/env";
import { hasPluggyCredentials } from "~/server/services/pluggy";
import { protectedProcedure } from "~/server/api/trpc";

/**
 * True only when the deployment is fully configured *and* the caller is the
 * configured owner. Missing credentials switch the feature off for everyone,
 * so a fresh clone or a half-configured deploy shows nothing at all rather
 * than a surface that cannot work.
 */
export function isOpenFinanceOwner(email: string | null | undefined): boolean {
  if (!hasPluggyCredentials()) return false;

  const owner = env.OPEN_FINANCE_OWNER_EMAIL;
  if (!owner || !email) return false;

  return owner.trim().toLowerCase() === email.trim().toLowerCase();
}

/**
 * Every bank procedure except `isEnabled` is built on this.
 *
 * NOT_FOUND rather than FORBIDDEN on purpose: a forbidden response confirms
 * the endpoint exists, which is precisely what a non-owner should not learn.
 */
export const bankOwnerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isOpenFinanceOwner(ctx.session.user.email)) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
  return next({ ctx });
});
