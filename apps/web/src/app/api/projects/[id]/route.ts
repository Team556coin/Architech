import { deleteProject, getProject, getVersion, latestJobsForProject, listMessages, listVersions, updateProject } from "@architech/db";
import { db } from "@/server/db";
import { HttpError, json, readJson, requireUser, route } from "@/server/http";
import { patchProjectInput } from "@/server/inputs";
import { deleteObjects } from "@/server/storage";
import { jobView, messageView, projectView, versionView } from "@/server/views";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const project = await getProject(db(), user.id, id);
  if (!project) throw new HttpError(404, "That project wasn't found.", "not_found");
  const [versions, messages, jobs] = await Promise.all([listVersions(db(), id), listMessages(db(), id), latestJobsForProject(db(), id, 5)]);
  return json({ project: projectView(project), versions: versions.map(versionView), messages: messages.map(messageView), jobs: jobs.map(jobView) });
});

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const patch = await readJson(req, (v) => patchProjectInput.parse(v));
  if (patch.coverVersionId && !(await getVersion(db(), id, patch.coverVersionId))) throw new HttpError(400, "That version wasn't found.", "invalid");
  const { expectedPlanningRevision, ...changes } = patch;
  if (changes.planning !== undefined && (expectedPlanningRevision === undefined || !changes.planning || changes.planning.revision !== expectedPlanningRevision + 1)) {
    throw new HttpError(400, "Save a new planning revision with its previous revision number.", "invalid");
  }
  const project = await updateProject(db(), user.id, id, changes, expectedPlanningRevision);
  if (!project) {
    if (await getProject(db(), user.id, id)) throw new HttpError(409, "This plan changed on another device. Reload before saving; your current edits are still on screen.", "planning_conflict");
    throw new HttpError(404, "That project wasn't found.", "not_found");
  }
  return json({ project: projectView(project) });
});

export const DELETE = route(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const project = await getProject(db(), user.id, id);
  if (!project) throw new HttpError(404, "That project wasn't found.", "not_found");
  const versions = await listVersions(db(), id);
  await deleteProject(db(), user.id, id);
  await deleteObjects(versions.flatMap((v) => [v.imageKey, v.thumbKey])).catch((e) => console.error("[projects] cleanup failed", e));
  return json({ ok: true });
});
