import { retryJob } from "@architech/db";
import { z } from "zod";
import { db } from "@/server/db";
import { HttpError, json, requireUser, route } from "@/server/http";
import { jobView } from "@/server/views";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const input = z.object({ complaint: z.string().max(300).optional() });

/** "Something's wrong": one free redo of a finished edit. */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const text = await req.text();
  let raw: unknown = {};
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, "Something in that request wasn't right.", "invalid");
  }
  const body = input.parse(raw);
  const job = await retryJob(db(), user.id, id, body.complaint);
  return json({ job: jobView(job) }, 202);
});
