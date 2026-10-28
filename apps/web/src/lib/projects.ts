import { versionLabel, type Planning, type Calibration, type EditRequest, type KeepItem, type SpaceType } from "@architech/core";
import { api, ApiError, type ServerProjectPayload } from "./api";
import {
  addDeviceVersion,
  createDeviceProject,
  deleteDeviceProject,
  getBlob,
  getDeviceProject,
  isDeviceId,
  listDeviceProjects,
  newDeviceId,
  saveDeviceProject,
  saveDevicePlanning,
  thumbKey,
  type DeviceProject,
} from "./device-store";
import { makeThumb } from "./images";
import { uid } from "./uid";
import type { Analysis, CJob, CMessage, CProject, CSummary, PhotoUpload } from "./types";

// ---- Object URLs for device pictures (kept for the life of the page) ----

const urlCache = new Map<string, string>();
async function blobUrl(key: string): Promise<string> {
  const hit = urlCache.get(key);
  if (hit) return hit;
  const blob = await getBlob(key);
  if (!blob) return "";
  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  return url;
}

// ---- Conversions ----

export function fromServer(p: ServerProjectPayload): CProject {
  return {
    id: p.project.id,
    where: "server",
    title: p.project.title,
    spaceType: p.project.spaceType,
    analysis: p.project.analysis,
    keep: p.project.keep,
    calibration: p.project.calibration,
    planning: p.project.planning ?? null,
    coverVersionId: p.project.coverVersionId,
    versions: p.versions.map((v) => {
      const job = p.jobs.find((j) => j.versionId === v.id);
      return { ...v, jobId: job?.id ?? null, retryOfJobId: job?.retryOfJobId ?? null };
    }),
    messages: p.messages,
    activeJobs: p.jobs.filter((j) => j.status === "queued" || j.status === "running"),
    createdAt: p.project.createdAt,
    updatedAt: p.project.updatedAt,
  };
}

export async function fromDevice(p: DeviceProject): Promise<CProject> {
  const versions = await Promise.all(
    [...p.versions]
      .sort((a, b) => a.number - b.number)
      .map(async (v) => ({ ...v, url: await blobUrl(v.id), thumbUrl: await blobUrl(thumbKey(v.id)) })),
  );
  return {
    id: p.id,
    where: "device",
    title: p.title,
    spaceType: p.spaceType,
    analysis: p.analysis,
    keep: p.keep,
    calibration: p.calibration,
    planning: p.planning ?? null,
    coverVersionId: p.coverVersionId,
    versions,
    messages: p.messages,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// ---- Listing and loading ----

export async function listAll(userId: string): Promise<{ projects: CSummary[]; serverCount: number; max: number; offline: boolean }> {
  let server: CSummary[] = [];
  let max = 5;
  let offline = false;
  try {
    const res = await api.listProjects();
    max = res.max;
    server = res.projects.map((p) => ({ ...p, where: "server" as const }));
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) throw e;
    offline = true;
  }
  const device = await Promise.all(
    (await listDeviceProjects(userId)).map(async (p): Promise<CSummary> => {
      const cover = p.versions.find((v) => v.id === p.coverVersionId) ?? p.versions.at(-1);
      const original = p.versions.find((v) => v.number === 0) ?? p.versions[0];
      return {
        id: p.id,
        where: "device",
        title: p.title,
        spaceType: p.spaceType,
        updatedAt: p.updatedAt,
        coverUrl: cover ? await blobUrl(thumbKey(cover.id)) : null,
        originalUrl: original ? await blobUrl(thumbKey(original.id)) : null,
        versionCount: p.versions.length,
      };
    }),
  );
  const projects = [...server, ...device].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { projects, serverCount: server.length, max, offline };
}

export async function loadProject(id: string): Promise<CProject | null> {
  if (isDeviceId(id)) {
    const p = await getDeviceProject(id);
    return p ? fromDevice(p) : null;
  }
  try {
    return fromServer(await api.getProject(id));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

// ---- Creating ----

export function initialCalibration(upload: Pick<PhotoUpload, "width" | "height" | "focalPx" | "analysis">, units: "imperial" | "metric"): Calibration {
  const a = upload.analysis;
  return {
    imageWidth: upload.width,
    imageHeight: upload.height,
    ...(upload.focalPx ? { focalPx: upload.focalPx } : {}),
    ...(a?.horizonY !== null && a?.horizonY !== undefined ? { horizonY: a.horizonY, horizonSource: "estimated" as const } : {}),
    references: a?.references ?? [],
    units,
  };
}

/** Saves a freshly uploaded photo as a project: on the server while there's room, otherwise on this device. */
export async function createFromUpload(opts: {
  userId: string;
  upload: PhotoUpload;
  units: "imperial" | "metric";
  serverHasRoom: boolean;
}): Promise<{ id: string; where: "server" | "device" }> {
  const { upload } = opts;
  const a = upload.analysis;
  const base = {
    title: a?.title || "My project",
    spaceType: (a?.spaceType ?? "other") as SpaceType,
    analysis: { summary: a?.summary ?? "", suggestions: a?.suggestions ?? [] } satisfies Analysis,
    keep: (a?.keep ?? []) as KeepItem[],
    calibration: initialCalibration(upload, opts.units),
  };
  if (opts.serverHasRoom) {
    try {
      const res = await api.createProject({ photoKey: upload.key, ...base });
      return { id: res.project.id, where: "server" };
    } catch (e) {
      if (!(e instanceof ApiError && e.code === "project_limit")) throw e;
    }
  }
  const image = await api.fetchBlob(upload.url);
  const thumb = await makeThumb(image);
  const now = new Date().toISOString();
  const versionId = uid();
  const p: DeviceProject = {
    id: newDeviceId(),
    userId: opts.userId,
    ...base,
    coverVersionId: versionId,
    versions: [{ id: versionId, number: 0, label: "Original", width: upload.width, height: upload.height, request: null, prompt: null, verified: true, problems: [], jobId: null, createdAt: now }],
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  await createDeviceProject(p, { [versionId]: { image, thumb } });
  return { id: p.id, where: "device" };
}

// ---- Editing ----

export function baseVersionFor(p: CProject, selectedId: string | null, fromOriginal: boolean) {
  if (fromOriginal) return p.versions[0]!;
  return p.versions.find((v) => v.id === selectedId) ?? p.versions.find((v) => v.id === p.coverVersionId) ?? p.versions.at(-1)!;
}

export async function startEdit(p: CProject, selectedVersionId: string | null, request: EditRequest): Promise<CJob> {
  const base = baseVersionFor(p, selectedVersionId, request.fromOriginal);
  if (p.where === "server") return (await api.startServerEdit(p.id, base.id, request)).job;
  const blob = await getBlob(base.id);
  if (!blob) throw new ApiError("That picture is missing from this device.", 404, "not_found");
  const up = await api.uploadPhoto(blob, { analyze: false });
  const history = p.messages.slice(-8).map((m) => ({ role: m.role, content: m.content }));
  return (await api.startDeviceEdit({ baseKey: up.key, spaceType: p.spaceType, calibration: p.calibration, history, request })).job;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polls an edit until it finishes. */
export async function waitForJob(id: string, onUpdate: (j: CJob) => void, signal?: AbortSignal): Promise<CJob> {
  let delay = 1200;
  let failures = 0;
  for (;;) {
    if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
    try {
      const { job } = await api.getJob(id);
      failures = 0;
      onUpdate(job);
      if (job.status === "succeeded" || job.status === "failed") return job;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) throw e;
      if (++failures > 20) throw e;
    }
    await sleep(delay);
    delay = Math.min(2500, delay + 200);
  }
}

export const userTextFor = (r: EditRequest) => r.message.trim() || `Drew ${r.drawings.length} thing${r.drawings.length === 1 ? "" : "s"} to add`;

/** Brings a finished edit into the project (downloads it for device projects). */
export async function applyJob(p: CProject, job: CJob, request: EditRequest): Promise<CProject> {
  if (p.where === "server") return (await loadProject(p.id)) ?? p;
  if (job.status !== "succeeded" || !job.resultUrl) return p;
  const image = await api.fetchBlob(job.resultUrl);
  const thumb = await makeThumb(image);
  const now = new Date().toISOString();
  const versionId = uid();
  const messages: CMessage[] = [
    { id: uid(), role: "user", content: userTextFor(request), versionId: null, followUps: [], createdAt: now },
    { id: uid(), role: "assistant", content: job.reply ?? "Here you go!", versionId, followUps: job.followUps, createdAt: now },
  ];
  const next = await addDeviceVersion(
    p.id,
    {
      id: versionId,
      number: 0,
      label: versionLabel(request),
      width: job.width ?? 0,
      height: job.height ?? 0,
      request,
      prompt: null,
      verified: job.verified ?? false,
      problems: job.problems,
      jobId: job.id,
      retryOfJobId: job.retryOfJobId,
      createdAt: now,
    },
    image,
    thumb,
    messages,
  );
  return fromDevice(next);
}

// ---- Updating ----

export type ProjectPatch = Partial<{ title: string; spaceType: SpaceType; keep: KeepItem[]; calibration: Calibration | null; coverVersionId: string; planning: Planning | null; expectedPlanningRevision: number }>;

export async function updateProject(p: CProject, patch: ProjectPatch): Promise<CProject> {
  if (p.where === "server") {
    const { project } = await api.updateProject(p.id, patch);
    return { ...p, ...project };
  }
  if (patch.planning) return fromDevice(await saveDevicePlanning(p.id, patch.planning, patch.expectedPlanningRevision ?? -1));
  const d = await getDeviceProject(p.id);
  if (!d) return p;
  const next = { ...d, ...patch, updatedAt: new Date().toISOString() };
  await saveDeviceProject(next);
  return { ...p, ...patch, updatedAt: next.updatedAt };
}

export async function removeProject(p: Pick<CProject, "id" | "where">) {
  if (p.where === "server") await api.deleteProject(p.id);
  else await deleteDeviceProject(p.id);
}

// ---- Moving between server and device ----

export function buildImportBundle(p: DeviceProject) {
  const versions = [...p.versions].sort((a, b) => a.number - b.number);
  const index = new Map(versions.map((v, i) => [v.id, i]));
  return {
    order: versions.map((v) => v.id),
    bundle: {
      title: p.title,
      spaceType: p.spaceType,
      analysis: p.analysis,
      keep: p.keep,
      calibration: p.calibration,
    planning: p.planning ?? null,
      versions: versions.map((v) => ({ label: v.label, request: v.request, prompt: v.prompt, verified: v.verified, problems: v.problems })),
      messages: p.messages.map((m) => ({ role: m.role, content: m.content, followUps: m.followUps, versionIndex: m.versionId ? (index.get(m.versionId) ?? null) : null })),
      coverIndex: Math.max(0, index.get(p.coverVersionId ?? "") ?? versions.length - 1),
    },
  };
}

/** Moves a device project onto the server (needs a free server slot). Returns the new id. */
export async function moveToServer(deviceId: string): Promise<string> {
  const p = await getDeviceProject(deviceId);
  if (!p) throw new ApiError("That project isn't on this device.", 404, "not_found");
  const { order, bundle } = buildImportBundle(p);
  const form = new FormData();
  form.set("bundle", JSON.stringify(bundle));
  for (const [i, id] of order.entries()) {
    const blob = await getBlob(id);
    if (!blob) throw new ApiError("A picture is missing from this device.", 404, "not_found");
    form.set(`v${i}`, blob, `v${i}.jpg`);
  }
  const res = await api.importProject(form);
  await deleteDeviceProject(deviceId);
  return res.project.id;
}

/** Moves a server project onto this device and frees its server slot. Returns the new id. */
export async function moveToDevice(userId: string, serverId: string): Promise<string> {
  const payload = await api.getProject(serverId);
  if (payload.jobs.some((j) => j.status === "queued" || j.status === "running")) {
    throw new ApiError("Wait for the current edit to finish first.", 409, "busy");
  }
  const images: Record<string, { image: Blob; thumb: Blob }> = {};
  for (const v of payload.versions) {
    const image = await api.fetchBlob(v.url);
    images[v.id] = { image, thumb: await api.fetchBlob(v.thumbUrl).catch(() => makeThumb(image)) };
  }
  const p: DeviceProject = {
    id: newDeviceId(),
    userId,
    title: payload.project.title,
    spaceType: payload.project.spaceType,
    analysis: payload.project.analysis,
    keep: payload.project.keep,
    calibration: payload.project.calibration,
    planning: payload.project.planning ?? null,
    coverVersionId: payload.project.coverVersionId,
    versions: payload.versions.map((v) => ({
      id: v.id,
      number: v.number,
      label: v.label,
      width: v.width,
      height: v.height,
      request: v.request,
      prompt: null,
      verified: v.verified,
      problems: v.problems,
      jobId: null,
      createdAt: v.createdAt,
    })),
    messages: payload.messages,
    createdAt: payload.project.createdAt,
    updatedAt: new Date().toISOString(),
  };
  await createDeviceProject(p, images);
  try {
    await api.deleteProject(serverId);
  } catch (e) {
    await deleteDeviceProject(p.id);
    throw e;
  }
  return p.id;
}
