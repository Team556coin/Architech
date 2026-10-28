import type { EditJob, Message, Project, ProjectSummary, Version } from "@architech/db";
import { fileUrl } from "./storage";

export const versionView = (v: Version) => ({
  id: v.id,
  parentId: v.parentId,
  number: v.number,
  label: v.label,
  url: fileUrl(v.imageKey),
  thumbUrl: fileUrl(v.thumbKey),
  width: v.width,
  height: v.height,
  request: v.request,
  verified: v.verified,
  problems: v.problems,
  createdAt: v.createdAt.toISOString(),
});
export type VersionView = ReturnType<typeof versionView>;

export const messageView = (m: Message) => ({
  id: m.id,
  role: m.role,
  content: m.content,
  versionId: m.versionId,
  followUps: m.followUps,
  createdAt: m.createdAt.toISOString(),
});
export type MessageView = ReturnType<typeof messageView>;

export const projectView = (p: Project) => ({
  id: p.id,
  title: p.title,
  spaceType: p.spaceType,
  analysis: p.analysis,
  keep: p.keep,
  calibration: p.calibration,
  planning: p.planning,
  coverVersionId: p.coverVersionId,
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
});
export type ProjectView = ReturnType<typeof projectView>;

export const summaryView = (s: ProjectSummary) => ({
  id: s.id,
  title: s.title,
  spaceType: s.spaceType,
  updatedAt: s.updatedAt.toISOString(),
  coverUrl: s.coverThumbKey ? fileUrl(s.coverThumbKey) : null,
  originalUrl: s.originalThumbKey ? fileUrl(s.originalThumbKey) : null,
  versionCount: s.versionCount,
});
export type SummaryView = ReturnType<typeof summaryView>;

export const jobView = (j: EditJob) => ({
  id: j.id,
  projectId: j.projectId,
  status: j.status,
  stage: j.stage,
  free: j.free,
  retryOfJobId: j.retryOfJobId,
  versionId: j.versionId,
  resultUrl: j.resultKey ? fileUrl(j.resultKey) : null,
  width: j.resultWidth,
  height: j.resultHeight,
  reply: j.reply,
  followUps: j.followUps,
  verified: j.verified,
  problems: j.problems,
  attempts: j.attempts,
  error: j.error,
  charged: j.charged,
  createdAt: j.createdAt.toISOString(),
});
export type JobView = ReturnType<typeof jobView>;
