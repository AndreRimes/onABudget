import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/index";

export const auth = betterAuth({
  trustedOrigins: ["https://onabudget.andrerimes.com", "http://localhost:3000"],
  database: drizzleAdapter(db, {
    provider: "sqlite",
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {},
});
