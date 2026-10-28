import { getJob } from "@architech/db";
import { db } from "@/server/db";
import { HttpError, json, requireUser, route } from "@/server/http";
import { jobView } from "@/server/views";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const job = await getJob(db(), user.id, id);
  if (!job) throw new HttpError(404, "That edit wasn't found.", "not_found");
  return json({ job: jobView(job) });
});
