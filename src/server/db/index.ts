import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import { env } from "../../env";
import { instrumentClient } from "./instrument";
import * as schema from "./schema";

/**
 * Cache the database connection in development. This avoids creating a new connection on every HMR
 * update.
 */
const globalForDb = globalThis as unknown as {
  client: Client | undefined;
};

const rawClient = globalForDb.client ?? createClient({ url: env.DATABASE_URL });
if (env.NODE_ENV !== "production") globalForDb.client = rawClient;

// Wrapped for query metrics. The raw client is what gets cached above, so HMR
// can never stack proxies on top of each other.
export const client = instrumentClient(rawClient);

export const db = drizzle(client, { schema });
