import type { Planning, Calibration, EditRequest, KeepItem, SpaceType } from "@architech/core";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Analysis, CMessage } from "./types";
import { uid } from "./uid";

/** A project kept only on this device (IndexedDB). Pictures are stored as blobs keyed by version id. */
export interface DeviceVersion {
  id: string;
  number: number;
  label: string;
  width: number;
  height: number;
  request: EditRequest | null;
  prompt: string | null;
  verified: boolean;
  problems: string[];
  jobId: string | null;
  retryOfJobId?: string | null;
  createdAt: string;
}

export interface DeviceProject {
  id: string;
  userId: string;
  title: string;
  spaceType: SpaceType;
  analysis: Analysis;
  keep: KeepItem[];
  calibration: Calibration | null;
  planning?: Planning | null;
  coverVersionId: string | null;
  versions: DeviceVersion[];
  messages: CMessage[];
  createdAt: string;
  updatedAt: string;
}

interface Schema extends DBSchema {
  projects: { key: string; value: DeviceProject; indexes: { byUser: string } };
  blobs: { key: string; value: Blob };
  pending: { key: string; value: { blob: Blob; createdAt: number } };
}

const DB_NAME = "architech";
let dbp: Promise<IDBPDatabase<Schema>> | null = null;

function database() {
  dbp ??= openDB<Schema>(DB_NAME, 1, {
    upgrade(db) {
      const projects = db.createObjectStore("projects", { keyPath: "id" });
      projects.createIndex("byUser", "userId");
      db.createObjectStore("blobs");
      db.createObjectStore("pending");
    },
  });
  return dbp;
}

/** For tests: forget the open connection. */
export async function resetDeviceStore() {
  if (dbp) (await dbp).close();
  dbp = null;
}

export const isDeviceId = (id: string) => id.startsWith("d-");
export const newDeviceId = () => `d-${uid()}`;
export const thumbKey = (versionId: string) => `${versionId}:thumb`;

export async function listDeviceProjects(userId: string): Promise<DeviceProject[]> {
  const all = await (await database()).getAllFromIndex("projects", "byUser", userId);
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getDeviceProject(id: string): Promise<DeviceProject | undefined> {
  return (await database()).get("projects", id);
}

export async function saveDeviceProject(p: DeviceProject): Promise<void> {
  await (await database()).put("projects", p);
}

export async function saveDevicePlanning(id: string, planning: Planning, expected: number): Promise<DeviceProject> {
  const tx = (await database()).transaction("projects", "readwrite");
  const current = await tx.store.get(id);
  if (!current || (current.planning?.revision ?? 0) !== expected || planning.revision !== expected + 1) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error("This plan changed in another tab. Reload before saving; your edits are still on screen.");
  }
  const next = { ...current, planning, updatedAt: new Date().toISOString() };
  await tx.store.put(next);
  await tx.done;
  return next;
}

export async function putBlob(key: string, blob: Blob): Promise<void> {
  await (await database()).put("blobs", blob, key);
}

export async function getBlob(key: string): Promise<Blob | undefined> {
  return (await database()).get("blobs", key);
}

/** Saves a whole new project with its pictures in one go. */
export async function createDeviceProject(p: DeviceProject, images: Record<string, { image: Blob; thumb: Blob }>): Promise<void> {
  const db = await database();
  const tx = db.transaction(["projects", "blobs"], "readwrite");
  for (const [id, b] of Object.entries(images)) {
    await tx.objectStore("blobs").put(b.image, id);
    await tx.objectStore("blobs").put(b.thumb, thumbKey(id));
  }
  await tx.objectStore("projects").put(p);
  await tx.done;
}

/** Adds an edited version (and its chat messages) to a device project. */
export async function addDeviceVersion(projectId: string, v: DeviceVersion, image: Blob, thumb: Blob, messages: CMessage[]): Promise<DeviceProject> {
  const db = await database();
  const tx = db.transaction(["projects", "blobs"], "readwrite");
  const p = await tx.objectStore("projects").get(projectId);
  if (!p) throw new Error("Project not found on this device");
  await tx.objectStore("blobs").put(image, v.id);
  await tx.objectStore("blobs").put(thumb, thumbKey(v.id));
  const number = p.versions.reduce((m, x) => Math.max(m, x.number), -1) + 1;
  const next: DeviceProject = {
    ...p,
    versions: [...p.versions, { ...v, number }],
    messages: [...p.messages, ...messages],
    coverVersionId: !v.request?.design || p.planning?.alternatives.some((a) => a.id === v.request!.design!.id && a.revision === v.request!.design!.revision) ? v.id : p.coverVersionId,
    updatedAt: new Date().toISOString(),
  };
  await tx.objectStore("projects").put(next);
  await tx.done;
  return next;
}

export async function deleteDeviceProject(id: string): Promise<void> {
  const db = await database();
  const tx = db.transaction(["projects", "blobs"], "readwrite");
  const p = await tx.objectStore("projects").get(id);
  if (p) {
    for (const v of p.versions) {
      await tx.objectStore("blobs").delete(v.id);
      await tx.objectStore("blobs").delete(thumbKey(v.id));
    }
    await tx.objectStore("projects").delete(id);
  }
  await tx.done;
}

/** Keeps a photo chosen before signing in so we can continue afterwards. */
export async function stashPendingPhoto(blob: Blob) {
  await (await database()).put("pending", { blob, createdAt: Date.now() }, "photo");
}

export async function takePendingPhoto(): Promise<Blob | null> {
  const db = await database();
  const row = await db.get("pending", "photo");
  if (!row) return null;
  await db.delete("pending", "photo");
  return Date.now() - row.createdAt < 3600_000 ? row.blob : null;
}
