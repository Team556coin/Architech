import { createDb, type Database } from "@architech/db";
import { env } from "./env";

const g = globalThis as unknown as { __architechDb?: { db: Database; close: () => Promise<void> } };

export function db(): Database {
  if (!g.__architechDb) {
    const c = createDb(env().DATABASE_URL, { max: 10 });
    g.__architechDb = { db: c.db, close: c.close };
  }
  return g.__architechDb.db;
}
