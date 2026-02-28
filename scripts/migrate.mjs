import { migrate } from "drizzle-orm/libsql/migrator";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.DATABASE_URL ?? "file:/data/db.sqlite",
});

const db = drizzle(client);

await migrate(db, { migrationsFolder: "/app/drizzle" });
console.log("Migration complete");
client.close();

