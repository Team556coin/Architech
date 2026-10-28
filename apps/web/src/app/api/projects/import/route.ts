import { randomUUID } from "node:crypto";
import { addMessage, createProject, listVersions, updateProject } from "@architech/db";
import { imageSize, prepareUpload, thumbnail } from "@architech/imaging";
import { db } from "@/server/db";
import { HttpError, json, MAX_UPLOAD_BYTES, requireUser, route } from "@/server/http";
import { importBundleInput } from "@/server/inputs";
import { deleteObjects, keys, putObject } from "@/server/storage";
import { projectView } from "@/server/views";

export const dynamic = "force-dynamic";

/** Moves a project from the device to the server (counts toward the 5-project limit). */
export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "Something in that request wasn't right.", "invalid");
  }
  const raw = form.get("bundle");
  if (typeof raw !== "string") throw new HttpError(400, "Something in that request wasn't right.", "invalid");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Something in that request wasn't right.", "invalid");
  }
  const bundle = importBundleInput.parse(parsed);

  const storageId = randomUUID();
  const written: string[] = [];
  try {
    const stored = [];
    for (let i = 0; i < bundle.versions.length; i++) {
      const file = form.get(`v${i}`);
      if (!(file instanceof Blob) || file.size === 0 || file.size > MAX_UPLOAD_BYTES) throw new HttpError(400, `Picture ${i + 1} is missing.`, "invalid");
      const bytes = Buffer.from(await file.arrayBuffer());
      const image = i === 0 ? (await prepareUpload(bytes)).buffer : bytes;
      const { width, height } = await imageSize(image);
      const fileId = randomUUID();
      const imageKey = keys.version(user.id, storageId, fileId);
      const thumbKey = keys.thumb(user.id, storageId, fileId);
      await putObject(imageKey, image);
      written.push(imageKey);
      await putObject(thumbKey, await thumbnail(image));
      written.push(thumbKey);
      stored.push({ imageKey, thumbKey, width, height });
    }
    const [original, ...rest] = stored;
    const { project } = await createProject(
      db(),
      user.id,
      { title: bundle.title, spaceType: bundle.spaceType, analysis: bundle.analysis, keep: bundle.keep, calibration: bundle.calibration, planning: bundle.planning },
      original!,
      rest.map((s, i) => ({ ...s, ...bundle.versions[i + 1]! })),
    );
    const versions = await listVersions(db(), project.id);
    for (const m of bundle.messages) {
      const versionId = m.versionIndex !== null ? (versions[m.versionIndex]?.id ?? null) : null;
      await addMessage(db(), { projectId: project.id, role: m.role, content: m.content, versionId, followUps: m.followUps });
    }
    const cover = versions[Math.min(bundle.coverIndex, versions.length - 1)];
    const updated = cover ? await updateProject(db(), user.id, project.id, { coverVersionId: cover.id }) : project;
    return json({ project: projectView(updated ?? project), versionIds: versions.map((v) => v.id) }, 201);
  } catch (e) {
    if (written.length) await deleteObjects(written).catch(() => {});
    throw e;
  }
});
