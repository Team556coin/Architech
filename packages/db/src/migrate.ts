import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Database } from "./client";

function migrationsFolder(): string {
  const candidates = [
    process.env.MIGRATIONS_DIR,
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations"),
    path.resolve(process.cwd(), "migrations"),
    path.resolve(process.cwd(), "packages/db/migrations"),
    path.resolve(process.cwd(), "../../packages/db/migrations"),
  ].filter(Boolean) as string[];
  const found = candidates.find((c) => existsSync(path.join(c, "meta", "_journal.json")));
  if (!found) throw new Error(`Migrations folder not found (looked in ${candidates.join(", ")})`);
  return found;
}

export async function runMigrations(db: Database) {
  await migrate(db, { migrationsFolder: migrationsFolder() });
}
