import type { Planning, Calibration, EditRequest, KeepItem, SpaceType } from "@architech/core";

/** Where a project is kept: on the server (max 5, syncs between phone and computer) or only on this device. */
export type Where = "server" | "device";

export interface Suggestion {
  label: string;
  prompt: string;
}

export interface Analysis {
  summary: string;
  suggestions: Suggestion[];
}

export interface CVersion {
  id: string;
  number: number;
  label: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  request: EditRequest | null;
  verified: boolean;
  problems: string[];
  /** Edit job that produced it (device projects use it for the free redo). */
  jobId?: string | null;
  /** Set when this version came from a free redo of that job. */
  retryOfJobId?: string | null;
  createdAt: string;
}

export interface CMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  versionId: string | null;
  followUps: string[];
  createdAt: string;
}

export interface CProject {
  id: string;
  where: Where;
  title: string;
  spaceType: SpaceType;
  analysis: Analysis;
  keep: KeepItem[];
  calibration: Calibration | null;
  planning?: Planning | null;
  coverVersionId: string | null;
  versions: CVersion[];
  messages: CMessage[];
  /** Edits still being made (server projects). */
  activeJobs?: CJob[];
  createdAt: string;
  updatedAt: string;
}

export interface CSummary {
  id: string;
  where: Where;
  title: string;
  spaceType: string;
  updatedAt: string;
  coverUrl: string | null;
  originalUrl: string | null;
  versionCount: number;
}

export interface Me {
  user: { id: string; name: string; email: string } | null;
  credits?: number;
  units?: "imperial" | "metric";
  serverProjects?: number;
  maxServerProjects?: number;
  aiReady: boolean;
}

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export interface CJob {
  id: string;
  projectId: string | null;
  status: JobStatus;
  stage: string;
  free: boolean;
  retryOfJobId: string | null;
  versionId: string | null;
  resultUrl: string | null;
  width: number | null;
  height: number | null;
  reply: string | null;
  followUps: string[];
  verified: boolean | null;
  problems: string[];
  attempts: number;
  error: string | null;
  createdAt: string;
}

export interface PhotoUpload {
  key: string;
  url: string;
  width: number;
  height: number;
  focalPx: number | null;
  analysis: {
    spaceType: SpaceType;
    title: string;
    summary: string;
    keep: KeepItem[];
    suggestions: Suggestion[];
    horizonY: number | null;
    references: Calibration["references"];
  } | null;
  analysisError: string | null;
}
