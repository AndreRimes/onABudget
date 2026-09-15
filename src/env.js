import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    BETTER_AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    DATABASE_URL: z.string().url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    BRAPI_API_TOKEN: z.string().optional(),
    /**
     * Bearer token Prometheus must send to scrape /api/metrics. Kept optional
     * here on purpose: the endpoint fails closed in production instead, so a
     * missing monitoring token can never stop the whole app from booting.
     */
    METRICS_TOKEN: z.string().min(16).optional(),
    /**
     * Meu Pluggy credentials (dashboard.pluggy.ai). Optional on purpose: with
     * either one missing the whole Open Finance feature stays switched off and
     * invisible, rather than half-rendering a surface that cannot work.
     */
    PLUGGY_CLIENT_ID: z.string().optional(),
    PLUGGY_CLIENT_SECRET: z.string().optional(),
    /**
     * The single account allowed to see or use Open Finance. Meu Pluggy's free
     * tier is licensed for personal use with your own accounts, so this is a
     * hard gate, not a preference: every other user gets NOT_FOUND and no UI.
     */
    OPEN_FINANCE_OWNER_EMAIL: z.string().email().optional(),
    /**
     * "true" opens registration. Unset means open in development and closed
     * in production — see `signupEnabled` in ~/server/better-auth/auth.
     */
    ALLOW_SIGNUP: z.enum(["true", "false"]).optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    BRAPI_API_TOKEN: process.env.BRAPI_API_TOKEN,
    METRICS_TOKEN: process.env.METRICS_TOKEN,
    PLUGGY_CLIENT_ID: process.env.PLUGGY_CLIENT_ID,
    PLUGGY_CLIENT_SECRET: process.env.PLUGGY_CLIENT_SECRET,
    OPEN_FINANCE_OWNER_EMAIL: process.env.OPEN_FINANCE_OWNER_EMAIL,
    ALLOW_SIGNUP: process.env.ALLOW_SIGNUP,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
