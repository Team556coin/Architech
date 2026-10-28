import { randomUUID } from "node:crypto";
import { MAX_SERVER_PROJECTS } from "@architech/core";
import { createProject, listProjects } from "@architech/db";
import { imageSize, thumbnail } from "@architech/imaging";
import { db } from "@/server/db";
import { HttpError, json, readJson, requireUser, route } from "@/server/http";
import { createProjectInput } from "@/server/inputs";
import { deleteObjects, getObject, keys, putObject } from "@/server/storage";
import { projectView, summaryView } from "@/server/views";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const user = await requireUser(req);
  const list = await listProjects(db(), user.id);
  return json({ projects: list.map(summaryView), max: MAX_SERVER_PROJECTS });
});

/** Saves a new project on the server from a photo uploaded with /api/photos. */
export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  const body = await readJson(req, (v) => createProjectInput.parse(v));
  if (!body.photoKey.startsWith(`tmp/${user.id}/`) || !keys.ownedBy(body.photoKey, user.id)) throw new HttpError(400, "That photo upload wasn't found.", "invalid");
  const photo = await getObject(body.photoKey);
  const { width, height } = await imageSize(photo);
  const projectTmpId = randomUUID();
  const fileId = randomUUID();
  const imageKey = keys.version(user.id, projectTmpId, fileId);
  const thumbKey = keys.thumb(user.id, projectTmpId, fileId);
  await putObject(imageKey, photo);
  await putObject(thumbKey, await thumbnail(photo));
  try {
    const { project, version } = await createProject(
      db(),
      user.id,
      { title: body.title, spaceType: body.spaceType, analysis: body.analysis, keep: body.keep, calibration: body.calibration },
      { imageKey, thumbKey, width, height },
    );
    await deleteObjects([body.photoKey]).catch(() => {});
    return json({ project: projectView(project), originalVersionId: version.id }, 201);
  } catch (e) {
    await deleteObjects([imageKey, thumbKey]).catch(() => {});
    throw e;
  }
});
