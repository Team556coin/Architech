import type { EditRequest } from "@architech/core";
import { enqueueJob, getProject, getVersion, listMessages, listVersions } from "@architech/db";
import { db } from "@/server/db";
import { aiReady } from "@/server/env";
import { HttpError, json, readJson, requireUser, route } from "@/server/http";
import { createEditInput } from "@/server/inputs";
import { copyObject, keys } from "@/server/storage";
import { jobView } from "@/server/views";

export const dynamic = "force-dynamic";

function assertOwnedSamples(userId: string, request: EditRequest) {
  for (const d of request.drawings) {
    if (d.look?.source !== "photo") continue;
    if (!d.look.photoKey || !keys.ownedBy(d.look.photoKey, userId)) {
      throw new HttpError(400, "That board photo wasn't found. Please choose it again.", "invalid");
    }
  }
}

/** Keeps an uploaded board photo with the project, so it is still there if the edit is retried later. */
async function keepSamples(userId: string, projectId: string, request: EditRequest): Promise<EditRequest> {
  const drawings = [];
  for (const d of request.drawings) {
    const key = d.look?.source === "photo" ? d.look.photoKey : undefined;
    if (!key || key.startsWith(`u/${userId}/p/${projectId}/`)) {
      drawings.push(d);
      continue;
    }
    const dest = `u/${userId}/p/${projectId}/sample-${d.id}.jpg`;
    await copyObject(key, dest);
    drawings.push({ ...d, look: { ...d.look!, photoKey: dest } });
  }
  return { ...request, drawings };
}

/** Queues an AI edit. Costs one edit credit (refunded if it fails or can't be checked). */
export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  if (!aiReady()) throw new HttpError(503, "The AI isn't set up yet. Add OPENROUTER_API_KEY to the server settings.", "ai_not_configured");
  const body = await readJson(req, (v) => createEditInput.parse(v));

  if (body.projectId) {
    const project = await getProject(db(), user.id, body.projectId);
    if (!project) throw new HttpError(404, "That project wasn't found.", "not_found");
    const versions = await listVersions(db(), project.id);
    const original = versions[0]!;
    let base = body.request.fromOriginal ? original : null;
    if (!base && body.baseVersionId) base = await getVersion(db(), project.id, body.baseVersionId);
    if (!base && project.coverVersionId) base = versions.find((v) => v.id === project.coverVersionId) ?? null;
    base ??= versions.at(-1)!;
    assertOwnedSamples(user.id, body.request);
    const history = (await listMessages(db(), project.id)).slice(-8).map((m) => ({ role: m.role, content: m.content }));
    const request = await keepSamples(user.id, project.id, { ...body.request, keep: body.request.keep.length ? body.request.keep : project.keep });
    const job = await enqueueJob(db(), {
      userId: user.id,
      projectId: project.id,
      baseVersionId: base.id,
      baseKey: base.imageKey,
      spaceType: project.spaceType,
      request,
      calibration: project.calibration,
      history,
    });
    return json({ job: jobView(job) }, 202);
  }

  if (!("baseKey" in body) || !body.baseKey.startsWith(`tmp/${user.id}/`) || !keys.ownedBy(body.baseKey, user.id)) {
    throw new HttpError(400, "Upload the starting photo first.", "invalid");
  }
  assertOwnedSamples(user.id, body.request);
  const job = await enqueueJob(db(), {
    userId: user.id,
    projectId: null,
    baseKey: body.baseKey,
    spaceType: body.spaceType,
    request: body.request,
    calibration: body.calibration,
    history: body.history.slice(-8),
  });
  return json({ job: jobView(job) }, 202);
});
