import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

export function createDb(url: string, opts: { max?: number } = {}) {
  const client = postgres(url, { max: opts.max ?? 10, onnotice: () => {} });
  const db = drizzle(client, { schema });
  return { db, client, close: () => client.end({ timeout: 5 }) };
}

/** Creates the database named in `url` if it doesn't exist yet (for test and local databases). */
export async function ensureDatabase(url: string) {
  const u = new URL(url);
  const name = decodeURIComponent(u.pathname.slice(1));
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error(`Unsafe database name: ${name}`);
  u.pathname = "/postgres";
  const admin = postgres(u.toString(), { max: 1, onnotice: () => {} });
  try {
    const found = await admin`select 1 from pg_database where datname = ${name}`;
    if (!found.length) {
      try {
        await admin.unsafe(`create database "${name}"`);
      } catch (e) {
        if ((e as { code?: string }).code !== "42P04") throw e;
      }
    }
  } finally {
    await admin.end({ timeout: 5 });
  }
}
