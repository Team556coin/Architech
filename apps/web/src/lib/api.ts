import type { DesignAlternative, Planning, Calibration, EditRequest, KeepItem, SpaceType } from "@architech/core";
import type { Analysis, CJob, Me, PhotoUpload } from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { credentials: "include", ...init });
  } catch {
    throw new ApiError("Can't reach HomeRedo. Check your internet connection.", 0, "offline");
  }
  const type = res.headers.get("content-type") ?? "";
  const body = type.includes("json") ? await res.json().catch(() => ({})) : {};
  if (!res.ok) throw new ApiError((body as { error?: string }).error ?? "Something went wrong. Please try again.", res.status, (body as { code?: string }).code ?? "error");
  return body as T;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export interface ServerProjectPayload {
  project: {
    id: string;
    title: string;
    spaceType: SpaceType;
    analysis: Analysis;
    keep: KeepItem[];
    calibration: Calibration | null;
    planning?: Planning | null;
    coverVersionId: string | null;
    createdAt: string;
    updatedAt: string;
  };
  versions: {
    id: string;
    parentId: string | null;
    number: number;
    label: string;
    url: string;
    thumbUrl: string;
    width: number;
    height: number;
    request: EditRequest | null;
    verified: boolean;
    problems: string[];
    createdAt: string;
  }[];
  messages: { id: string; role: "user" | "assistant"; content: string; versionId: string | null; followUps: string[]; createdAt: string }[];
  jobs: CJob[];
}

export const api = {
  design: (body: { design: DesignAlternative; message: string; selectedId: string | null; photoKeys?: string[] }) => request<{ design: DesignAlternative; reply: string }>("/api/design", jsonInit("POST", body)),
  me: () => request<Me>("/api/me"),
  setUnits: (units: "imperial" | "metric") => request("/api/me", jsonInit("PATCH", { units })),

  uploadPhoto: (file: Blob, opts: { analyze: boolean; focal35?: number | null }) => {
    const form = new FormData();
    form.set("photo", file, "photo.jpg");
    if (!opts.analyze) form.set("analyze", "false");
    if (opts.focal35) form.set("focal35", String(opts.focal35));
    return request<PhotoUpload>("/api/photos", { method: "POST", body: form });
  },

  listProjects: () =>
    request<{ projects: { id: string; title: string; spaceType: string; updatedAt: string; coverUrl: string | null; originalUrl: string | null; versionCount: number }[]; max: number }>("/api/projects"),
  createProject: (body: { photoKey: string; title: string; spaceType: SpaceType; analysis: Analysis; keep: KeepItem[]; calibration: Calibration | null }) =>
    request<{ project: ServerProjectPayload["project"]; originalVersionId: string }>("/api/projects", jsonInit("POST", body)),
  getProject: (id: string) => request<ServerProjectPayload>(`/api/projects/${id}`),
  updateProject: (id: string, patch: Partial<{ title: string; spaceType: SpaceType; keep: KeepItem[]; calibration: Calibration | null; coverVersionId: string; planning: Planning | null; expectedPlanningRevision: number }>) =>
    request<{ project: ServerProjectPayload["project"] }>(`/api/projects/${id}`, jsonInit("PATCH", patch)),
  deleteProject: (id: string) => request(`/api/projects/${id}`, { method: "DELETE" }),
  importProject: (form: FormData) => request<{ project: ServerProjectPayload["project"]; versionIds: string[] }>("/api/projects/import", { method: "POST", body: form }),

  startServerEdit: (projectId: string, baseVersionId: string | null, req: EditRequest) =>
    request<{ job: CJob }>("/api/edits", jsonInit("POST", { projectId, ...(baseVersionId ? { baseVersionId } : {}), request: req })),
  startDeviceEdit: (body: { baseKey: string; spaceType: SpaceType; calibration: Calibration | null; history: { role: "user" | "assistant"; content: string }[]; request: EditRequest }) =>
    request<{ job: CJob }>("/api/edits", jsonInit("POST", body)),
  getJob: (id: string) => request<{ job: CJob }>(`/api/edits/${id}`),
  retryJob: (id: string, complaint?: string) => request<{ job: CJob }>(`/api/edits/${id}/retry`, jsonInit("POST", { complaint })),

  fetchBlob: async (url: string): Promise<Blob> => {
    let res: Response;
    try {
      res = await fetch(url, { credentials: "include" });
    } catch {
      throw new ApiError("Can't reach HomeRedo. Check your internet connection.", 0, "offline");
    }
    if (!res.ok) throw new ApiError("Couldn't load that picture.", res.status, "not_found");
    return res.blob();
  },
};
