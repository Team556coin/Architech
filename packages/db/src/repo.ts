import { EDIT_COST, EDITS_PER_MINUTE, FREE_CREDITS, MAX_SERVER_PROJECTS, type Planning, type Calibration, type EditRequest, type KeepItem } from "@architech/core";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Database } from "./client";
import { creditLedger, editJobs, messages, profiles, projects, versions, type EditJob, type Project, type ProjectAnalysis, type Version } from "./schema";

export class ProjectLimitError extends Error {
  constructor() {
    super(`You can keep ${MAX_SERVER_PROJECTS} projects on the server. Move one to this device first.`);
  }
}
export class OutOfCreditsError extends Error {
  constructor() {
    super("You're out of edits.");
  }
}
export class RateLimitError extends Error {
  constructor() {
    super("Whoa, that's a lot of edits at once. Give it a minute.");
  }
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Exec = Database | Tx;

// ---- Credits ----

export async function ensureProfile(db: Exec, userId: string) {
  const inserted = await db.insert(profiles).values({ userId, credits: FREE_CREDITS }).onConflictDoNothing().returning();
  if (inserted.length) await db.insert(creditLedger).values({ userId, delta: FREE_CREDITS, reason: "welcome" });
}

export async function getCredits(db: Exec, userId: string): Promise<number> {
  const [row] = await db.select({ credits: profiles.credits }).from(profiles).where(eq(profiles.userId, userId));
  return row?.credits ?? 0;
}

export async function getProfile(db: Exec, userId: string) {
  await ensureProfile(db, userId);
  const [row] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  return row!;
}

export async function setUnits(db: Exec, userId: string, units: "imperial" | "metric") {
  await db.update(profiles).set({ units }).where(eq(profiles.userId, userId));
}

async function spend(db: Exec, userId: string, amount: number, reason: string, jobId: string | null) {
  const rows = await db
    .update(profiles)
    .set({ credits: sql`${profiles.credits} - ${amount}` })
    .where(and(eq(profiles.userId, userId), sql`${profiles.credits} >= ${amount}`))
    .returning({ credits: profiles.credits });
  if (!rows.length) throw new OutOfCreditsError();
  await db.insert(creditLedger).values({ userId, delta: -amount, reason, jobId });
}

async function refund(db: Exec, userId: string, amount: number, reason: string, jobId: string) {
  await db.update(profiles).set({ credits: sql`${profiles.credits} + ${amount}` }).where(eq(profiles.userId, userId));
  await db.insert(creditLedger).values({ userId, delta: amount, reason, jobId });
}

// ---- Projects ----

export interface ProjectInput {
  title: string;
  spaceType: string;
  analysis: ProjectAnalysis;
  keep: KeepItem[];
  calibration: Calibration | null;
  planning?: Planning | null;
}

export interface VersionInput {
  imageKey: string;
  thumbKey: string;
  width: number;
  height: number;
}

export async function countProjects(db: Exec, userId: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(projects).where(eq(projects.userId, userId));
  return row?.n ?? 0;
}

/** Creates a server project with its Original version. Throws ProjectLimitError past the limit. */
export async function createProject(db: Database, userId: string, input: ProjectInput, original: VersionInput, extraVersions: (VersionInput & { label: string; request: EditRequest | null; prompt: string | null; verified?: boolean; problems?: string[] })[] = []) {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
      if ((await countProjects(tx, userId)) >= MAX_SERVER_PROJECTS) throw new ProjectLimitError();
      const [project] = await tx.insert(projects).values({ userId, ...input }).returning();
      const [version] = await tx
        .insert(versions)
        .values({ projectId: project!.id, number: 0, label: "Original", ...original })
        .returning();
      let parentId = version!.id;
      let cover = version!.id;
      for (const [i, v] of extraVersions.entries()) {
        const [row] = await tx
          .insert(versions)
          .values({ projectId: project!.id, parentId, number: i + 1, label: v.label, imageKey: v.imageKey, thumbKey: v.thumbKey, width: v.width, height: v.height, request: v.request, prompt: v.prompt, verified: v.verified ?? true, problems: v.problems ?? [] })
          .returning();
        parentId = row!.id;
        cover = row!.id;
      }
      const [withCover] = await tx.update(projects).set({ coverVersionId: cover }).where(eq(projects.id, project!.id)).returning();
      return { project: withCover!, version: version! };
    });
  } catch (e) {
    if (e instanceof ProjectLimitError) throw e;
    if (e instanceof Error && /project limit/i.test(e.message + String((e as { cause?: unknown }).cause ?? ""))) throw new ProjectLimitError();
    throw e;
  }
}

export interface ProjectSummary {
  id: string;
  title: string;
  spaceType: string;
  updatedAt: Date;
  coverThumbKey: string | null;
  coverImageKey: string | null;
  originalThumbKey: string | null;
  versionCount: number;
}

export async function listProjects(db: Exec, userId: string): Promise<ProjectSummary[]> {
  const rows = await db.execute<{
    id: string;
    title: string;
    space_type: string;
    updated_at: Date;
    cover_thumb: string | null;
    cover_image: string | null;
    original_thumb: string | null;
    version_count: number;
  }>(sql`
    select p.id, p.title, p.space_type, p.updated_at,
      cv.thumb_key as cover_thumb, cv.image_key as cover_image,
      (select v.thumb_key from versions v where v.project_id = p.id and v.number = 0 limit 1) as original_thumb,
      (select count(*)::int from versions v where v.project_id = p.id) as version_count
    from projects p
    left join versions cv on cv.id = p.cover_version_id
    where p.user_id = ${userId}
    order by p.updated_at desc`);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    spaceType: r.space_type,
    updatedAt: new Date(r.updated_at),
    coverThumbKey: r.cover_thumb,
    coverImageKey: r.cover_image,
    originalThumbKey: r.original_thumb,
    versionCount: Number(r.version_count),
  }));
}

export async function getProject(db: Exec, userId: string, id: string): Promise<Project | null> {
  if (!isUuid(id)) return null;
  const [row] = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.userId, userId)));
  return row ?? null;
}

export async function updateProject(db: Exec, userId: string, id: string, patch: Partial<Pick<Project, "title" | "keep" | "calibration" | "coverVersionId" | "spaceType" | "planning">>, expectedPlanningRevision?: number) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .update(projects)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.userId, userId), expectedPlanningRevision === undefined ? undefined : sql`coalesce((${projects.planning}->>'revision')::int, 0) = ${expectedPlanningRevision}`))
    .returning();
  return row ?? null;
}

export async function deleteProject(db: Exec, userId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await db.delete(projects).where(and(eq(projects.id, id), eq(projects.userId, userId))).returning({ id: projects.id });
  return rows.length > 0;
}

export async function listVersions(db: Exec, projectId: string): Promise<Version[]> {
  return db.select().from(versions).where(eq(versions.projectId, projectId)).orderBy(asc(versions.number));
}

export async function getVersion(db: Exec, projectId: string, versionId: string): Promise<Version | null> {
  if (!isUuid(versionId)) return null;
  const [row] = await db.select().from(versions).where(and(eq(versions.id, versionId), eq(versions.projectId, projectId)));
  return row ?? null;
}

export async function addVersion(
  db: Exec,
  v: { projectId: string; parentId: string | null; label: string; imageKey: string; thumbKey: string; width: number; height: number; request: EditRequest | null; prompt: string | null; verified: boolean; problems: string[] },
): Promise<Version> {
  const [row] = await db
    .insert(versions)
    .values({ ...v, number: sql`(select coalesce(max(number), -1) + 1 from versions where project_id = ${v.projectId})` })
    .returning();
  return row!;
}

export async function addMessage(db: Exec, m: { projectId: string; role: "user" | "assistant"; content: string; versionId?: string | null; followUps?: string[] }) {
  const [row] = await db
    .insert(messages)
    .values({ projectId: m.projectId, role: m.role, content: m.content, versionId: m.versionId ?? null, followUps: m.followUps ?? [] })
    .returning();
  return row!;
}

export async function listMessages(db: Exec, projectId: string) {
  return db.select().from(messages).where(eq(messages.projectId, projectId)).orderBy(asc(messages.seq));
}

// ---- Edit jobs ----

export interface EnqueueInput {
  userId: string;
  projectId: string | null;
  baseVersionId?: string | null;
  baseKey: string;
  spaceType: string;
  request: EditRequest;
  calibration: Calibration | null;
  history: { role: "user" | "assistant"; content: string }[];
  free?: boolean;
  skipRateLimit?: boolean;
}

export async function enqueueJob(db: Database, input: EnqueueInput): Promise<EditJob> {
  return db.transaction(async (tx) => {
    if (!input.skipRateLimit) {
      const [recent] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(editJobs)
        .where(and(eq(editJobs.userId, input.userId), sql`${editJobs.createdAt} > now() - interval '1 minute'`));
      if ((recent?.n ?? 0) >= EDITS_PER_MINUTE) throw new RateLimitError();
    }
    const [job] = await tx
      .insert(editJobs)
      .values({
        userId: input.userId,
        projectId: input.projectId,
        baseVersionId: input.baseVersionId ?? null,
        baseKey: input.baseKey,
        spaceType: input.spaceType,
        request: input.request,
        calibration: input.calibration,
        history: input.history,
        free: !!input.free,
        charged: !input.free,
      })
      .returning();
    if (!input.free) await spend(tx, input.userId, EDIT_COST, "edit", job!.id);
    return job!;
  });
}

export async function claimNextJob(db: Database): Promise<EditJob | null> {
  const rows = await db.execute<{ id: string }>(sql`
    update edit_jobs set status = 'running', stage = 'understanding', started_at = now(), heartbeat_at = now()
    where id = (
      select id from edit_jobs where status = 'queued' order by created_at for update skip locked limit 1
    )
    returning id`);
  const id = rows[0]?.id;
  if (!id) return null;
  const [job] = await db.select().from(editJobs).where(eq(editJobs.id, id));
  return job ?? null;
}

export async function setJobStage(db: Exec, id: string, stage: string) {
  await db.update(editJobs).set({ stage, heartbeatAt: new Date() }).where(eq(editJobs.id, id));
}

export async function getJob(db: Exec, userId: string, id: string): Promise<EditJob | null> {
  if (!isUuid(id)) return null;
  const [row] = await db.select().from(editJobs).where(and(eq(editJobs.id, id), eq(editJobs.userId, userId)));
  return row ?? null;
}

export async function getJobById(db: Exec, id: string): Promise<EditJob | null> {
  const [row] = await db.select().from(editJobs).where(eq(editJobs.id, id));
  return row ?? null;
}

export interface JobResult {
  resultKey: string;
  thumbKey: string;
  width: number;
  height: number;
  reply: string;
  followUps: string[];
  prompt: string;
  verified: boolean;
  problems: string[];
  attempts: number;
  label: string;
}

export async function completeJob(db: Database, id: string, r: JobResult): Promise<EditJob> {
  return db.transaction(async (tx) => {
    const [job] = await tx.select().from(editJobs).where(eq(editJobs.id, id)).for("update");
    if (!job) throw new Error("Job not found");
    let versionId: string | null = null;
    if (job.projectId) {
      const v = await addVersion(tx, {
        projectId: job.projectId,
        parentId: job.baseVersionId,
        label: r.label,
        imageKey: r.resultKey,
        thumbKey: r.thumbKey,
        width: r.width,
        height: r.height,
        request: job.request,
        prompt: r.prompt,
        verified: r.verified,
        problems: r.problems,
      });
      versionId = v.id;
      const userText = job.request.message.trim() || `Drew ${job.request.drawings.length} thing${job.request.drawings.length === 1 ? "" : "s"} to add`;
      await addMessage(tx, { projectId: job.projectId, role: "user", content: userText });
      await addMessage(tx, { projectId: job.projectId, role: "assistant", content: r.reply, versionId, followUps: r.followUps });
      const [currentProject] = await tx.select().from(projects).where(eq(projects.id, job.projectId)).for("update");
      const design = job.request.design;
      const currentDesign = design && currentProject?.planning?.alternatives.find((a) => a.id === design.id);
      // Keep the result in history, but never promote a render of an obsolete design.
      if (!design || currentDesign?.revision === design.revision) await tx.update(projects).set({ coverVersionId: versionId, updatedAt: new Date() }).where(eq(projects.id, job.projectId));
    }
    let charged = job.charged;
    if (!r.verified && charged) {
      await refund(tx, job.userId, EDIT_COST, "unverified-result", job.id);
      charged = false;
    }
    const [updated] = await tx
      .update(editJobs)
      .set({
        status: "succeeded",
        stage: "done",
        resultKey: r.resultKey,
        resultWidth: r.width,
        resultHeight: r.height,
        reply: r.reply,
        followUps: r.followUps,
        verified: r.verified,
        problems: r.problems,
        attempts: r.attempts,
        versionId,
        charged,
        finishedAt: new Date(),
      })
      .where(eq(editJobs.id, id))
      .returning();
    return updated!;
  });
}

export async function failJob(db: Database, id: string, error: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [job] = await tx.select().from(editJobs).where(eq(editJobs.id, id)).for("update");
    if (!job || job.status === "failed" || job.status === "succeeded") return;
    if (job.charged) await refund(tx, job.userId, EDIT_COST, "failed-edit", job.id);
    await tx.update(editJobs).set({ status: "failed", stage: "failed", error: error.slice(0, 500), charged: false, finishedAt: new Date() }).where(eq(editJobs.id, id));
  });
}

export async function requeueStaleJobs(db: Exec, olderThanMs: number): Promise<number> {
  const rows = await db
    .update(editJobs)
    .set({ status: "queued", stage: "queued" })
    .where(and(eq(editJobs.status, "running"), sql`${editJobs.heartbeatAt} < now() - (${olderThanMs} || ' milliseconds')::interval`))
    .returning({ id: editJobs.id });
  return rows.length;
}

export class RetryNotAllowedError extends Error {
  constructor() {
    super("That edit already got its free redo.");
  }
}

/** Queues the one free redo of a finished edit, from the same starting photo and request. */
export async function retryJob(db: Database, userId: string, jobId: string, complaint?: string): Promise<EditJob> {
  const original = await getJob(db, userId, jobId);
  if (!original || original.status !== "succeeded" || original.retryOfJobId) throw new RetryNotAllowedError();
  const note = complaint?.trim() ? `The last try wasn't right: ${complaint.trim().slice(0, 300)}` : "The last try wasn't right. Try again, following the request and marks more closely.";
  try {
    const [job] = await db
      .insert(editJobs)
      .values({
        userId,
        projectId: original.projectId,
        baseVersionId: original.baseVersionId,
        baseKey: original.baseKey,
        spaceType: original.spaceType,
        request: original.request,
        calibration: original.calibration,
        history: [...original.history, ...(original.reply ? [{ role: "assistant" as const, content: original.reply }] : []), { role: "user" as const, content: note }],
        free: true,
        charged: false,
        retryOfJobId: original.id,
      })
      .returning();
    return job!;
  } catch (e) {
    if (/edit_jobs_retry_of_idx|duplicate key/i.test(String(e) + String((e as { cause?: unknown }).cause ?? ""))) throw new RetryNotAllowedError();
    throw e;
  }
}

/** Deletes finished jobs of device projects older than the cutoff and returns their storage keys for cleanup. */
export async function purgeDeviceJobs(db: Exec, olderThanMs: number) {
  return db
    .delete(editJobs)
    .where(and(sql`${editJobs.projectId} is null`, sql`${editJobs.status} in ('succeeded','failed')`, sql`${editJobs.finishedAt} < now() - (${olderThanMs} || ' milliseconds')::interval`))
    .returning({ id: editJobs.id, baseKey: editJobs.baseKey, resultKey: editJobs.resultKey });
}

export async function latestJobsForProject(db: Exec, projectId: string, limit = 5) {
  return db.select().from(editJobs).where(eq(editJobs.projectId, projectId)).orderBy(desc(editJobs.createdAt)).limit(limit);
}

export async function latestJobs(db: Exec, userId: string, limit = 10) {
  return db.select().from(editJobs).where(eq(editJobs.userId, userId)).orderBy(desc(editJobs.createdAt)).limit(limit);
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
