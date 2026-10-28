import { MAX_SERVER_PROJECTS } from "@architech/core";
import { countProjects, getProfile, setUnits } from "@architech/db";
import { z } from "zod";
import { db } from "@/server/db";
import { aiReady } from "@/server/env";
import { getUser, json, readJson, requireUser, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const user = await getUser(req);
  if (!user) return json({ user: null, aiReady: aiReady() });
  const [profile, serverProjects] = await Promise.all([getProfile(db(), user.id), countProjects(db(), user.id)]);
  return json({ user, credits: profile.credits, units: profile.units, serverProjects, maxServerProjects: MAX_SERVER_PROJECTS, aiReady: aiReady() });
});

const patchSchema = z.object({ units: z.enum(["imperial", "metric"]) });

export const PATCH = route(async (req: Request) => {
  const user = await requireUser(req);
  const body = await readJson(req, (v) => patchSchema.parse(v));
  await setUnits(db(), user.id, body.units);
  return json({ ok: true, units: body.units });
});
