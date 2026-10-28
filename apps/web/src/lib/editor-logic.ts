import { editRequestSchema, type Drawing, type EditRequest, type KeepItem } from "@architech/core";
import { finalizeDrawings } from "./drawing-tools";
import type { CProject, CVersion, Suggestion } from "./types";

// ---- Undo history ----

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** Where an uncommitted change (a drag) started. */
  base?: T;
}

const LIMIT = 60;

export const history = {
  init: <T>(present: T): History<T> => ({ past: [], present, future: [] }),
  push: <T>(h: History<T>, next: T): History<T> => {
    const from = h.base ?? h.present;
    if (next === from) return h.base === undefined ? h : { past: h.past, present: next, future: h.future };
    return { past: [...h.past, from].slice(-LIMIT), present: next, future: [] };
  },
  /** Change the present without making an undo step (e.g. while dragging). */
  set: <T>(h: History<T>, next: T): History<T> => ({ ...h, present: next, base: h.base ?? h.present }),
  undo: <T>(h: History<T>): History<T> => {
    if (h.base !== undefined) h = { past: h.past, present: h.present, future: h.future };
    return h.past.length ? { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future] } : h;
  },
  redo: <T>(h: History<T>): History<T> => (h.future.length ? { past: [...h.past, h.present], present: h.future[0]!, future: h.future.slice(1) } : h),
  canUndo: <T>(h: History<T>) => h.past.length > 0,
};

// ---- Requests ----

export function buildRequest(input: { message: string; drawings: Drawing[]; keep: KeepItem[]; fromOriginal?: boolean }): { ok: true; request: EditRequest } | { ok: false; error: string } {
  const parsed = editRequestSchema.safeParse({
    message: input.message.trim(),
    drawings: finalizeDrawings(input.drawings),
    keep: input.keep,
    fromOriginal: input.fromOriginal ?? false,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Tell us what to change or draw something" };
  return { ok: true, request: parsed.data };
}

// ---- Idea chips ----

export function chipsFor(p: CProject, versionId: string | null): Suggestion[] {
  const reply = [...p.messages].reverse().find((m) => m.role === "assistant" && m.versionId === versionId && m.followUps.length);
  if (reply) return reply.followUps.map((f) => ({ label: f, prompt: f }));
  return p.analysis.suggestions;
}

export function previousVersionId(p: CProject, selectedId: string | null): string | null {
  const sorted = [...p.versions].sort((a, b) => a.number - b.number);
  const i = sorted.findIndex((v) => v.id === selectedId);
  return i > 0 ? sorted[i - 1]!.id : null;
}

/** The server allows one free redo per edit, and never a redo of a redo. */
export function canRedoFree(versions: CVersion[], v: CVersion): boolean {
  if (!v.jobId || v.retryOfJobId) return false;
  return !versions.some((x) => x.retryOfJobId === v.jobId);
}

// ---- Drawings not sent yet (survive a reload) ----

const drawKey = (projectId: string) => `architech:drawings:${projectId}`;

/** Unfinished drawings (one dot so far) fail the full schema but are still worth keeping. */
function isDrawingLike(d: unknown): d is Drawing {
  if (!d || typeof d !== "object") return false;
  const x = d as Record<string, unknown>;
  return typeof x.id === "string" && typeof x.itemType === "string" && typeof x.number === "number" && ["line", "area", "brush"].includes(x.kind as string) && Array.isArray(x.points);
}

export function saveDraftDrawings(projectId: string, drawings: Drawing[]) {
  try {
    if (drawings.length) localStorage.setItem(drawKey(projectId), JSON.stringify(drawings));
    else localStorage.removeItem(drawKey(projectId));
  } catch {
    /* storage full or blocked */
  }
}

export function loadDraftDrawings(projectId: string): Drawing[] {
  try {
    const raw = localStorage.getItem(drawKey(projectId));
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter(isDrawingLike) : [];
  } catch {
    return [];
  }
}

// ---- Edits still running (survive a reload) ----

export interface PendingJob {
  jobId: string;
  request: EditRequest;
}

const jobKey = (projectId: string) => `architech:job:${projectId}`;

export function savePendingJob(projectId: string, job: PendingJob) {
  try {
    localStorage.setItem(jobKey(projectId), JSON.stringify(job));
  } catch {
    /* storage full or blocked */
  }
}

export function loadPendingJob(projectId: string): PendingJob | null {
  try {
    const raw = localStorage.getItem(jobKey(projectId));
    return raw ? (JSON.parse(raw) as PendingJob) : null;
  } catch {
    return null;
  }
}

export function clearPendingJob(projectId: string) {
  try {
    localStorage.removeItem(jobKey(projectId));
  } catch {
    /* ignore */
  }
}
