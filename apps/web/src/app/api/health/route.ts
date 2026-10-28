import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { ensureBucket } from "@/server/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db().execute(sql`select 1`);
    await ensureBucket();
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
