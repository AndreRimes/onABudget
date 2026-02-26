import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

const url = (process.env.DATABASE_URL ?? 'file:/data/db.sqlite').replace('file:', '');
const db = drizzle(new Database(url));
await migrate(db, { migrationsFolder: '/app/drizzle' });
console.log('Migration complete');