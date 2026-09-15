import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/index";
import { seedDefaultsForUser } from "../db/seed-defaults";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Whether anyone may create an account. A personal deployment has exactly the
 * users it needs, and an open registration form is otherwise a free way for
 * strangers to burn the metered quote quota or probe the bank sync. Closed by
 * default in production; set ALLOW_SIGNUP=true to register the first account,
 * then unset it.
 */
export const signupEnabled =
  process.env.ALLOW_SIGNUP !== undefined
    ? process.env.ALLOW_SIGNUP === "true"
    : !isProduction;

/**
 * A dev server lands on whatever port is free — Next falls back to 3001, 3002…
 * when 3000 is already taken — and pinning a single port makes every sign-in
 * from the others fail with "Invalid origin" 403s that look like broken auth
 * rather than a config mismatch.
 *
 * The wildcard is matched against the whole origin, so it covers any local
 * port while still rejecting lookalikes such as http://localhost.evil.com.
 * Development only: production keeps trusting exactly one origin.
 */
const developmentOrigins = ["http://localhost:*", "http://127.0.0.1:*"];

export const auth = betterAuth({
  trustedOrigins: [
    "https://onabudget.andrerimes.com",
    ...(isProduction ? [] : developmentOrigins),
  ],
  database: drizzleAdapter(db, {
    provider: "sqlite",
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: !signupEnabled,
  },
  socialProviders: {},
  databaseHooks: {
    user: {
      create: {
        // Categories and asset types are owned per user (migration 0014), so a
        // new account starts with empty pickers — and an empty picker blocks
        // the import flows entirely. Seeding here rather than lazily on read
        // means a user who deliberately deletes a default never sees it
        // reappear on the next page load.
        after: async (user) => {
          try {
            await seedDefaultsForUser(user.id);
          } catch (error) {
            // Never fail sign-up over starter data: the account is already
            // created at this point, and everything seeded here can be typed
            // by hand. Log loudly so it is visible if it ever happens.
            console.error("[auth] failed to seed defaults for new user", error);
          }
        },
      },
    },
  },
});
