import { runMigrations } from "@architech/db";
import { db } from "./db";
import { env } from "./env";
import { ensureBucket } from "./storage";
import { startWorker } from "./worker";

export async function boot() {
  const e = env();
  if (e.AUTO_MIGRATE === "true") {
    await runMigrations(db());
    console.log("[boot] database ready");
  }
  try {
    await ensureBucket();
    console.log(`[boot] storage bucket "${e.S3_BUCKET}" ready`);
  } catch (err) {
    if (e.NODE_ENV === "production") throw err;
    console.error("[boot]", (err as Error).message);
  }
  if (e.AI_PROVIDER === "openrouter" && !e.OPENROUTER_API_KEY) console.warn("[boot] OPENROUTER_API_KEY is not set; AI features will be unavailable.");
  if (e.WORKER_CONCURRENCY > 0) startWorker();
}
