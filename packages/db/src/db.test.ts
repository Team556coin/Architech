import { MAX_SERVER_PROJECTS, designAlternativeSchema, planningSchema } from "@architech/core";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Database } from "./client";
import { runMigrations } from "./migrate";
import * as schema from "./schema";
import {
  addMessage,
  addVersion,
  claimNextJob,
  completeJob,
  createProject,
  deleteProject,
  enqueueJob,
  ensureDatabase,
  ensureProfile,
  failJob,
  getCredits,
  getJob,
  getProject,
  listMessages,
  listProjects,
  listVersions,
  OutOfCreditsError,
  ProjectLimitError,
  purgeDeviceJobs,
  RateLimitError,
  requeueStaleJobs,
  retryJob,
  RetryNotAllowedError,
  updateProject,
} from "./index";

const url = process.env.TEST_DATABASE_URL ?? "postgres://architech:architech@localhost:5433/architech_test";
let db: Database;
let close: () => Promise<void>;

async function makeUser(id: string) {
  await db.insert(schema.user).values({ id, name: id, email: `${id}@example.com` });
  await ensureProfile(db, id);
}

const original = { imageKey: "k/orig.jpg", thumbKey: "k/orig-thumb.jpg", width: 1536, height: 1024 };
const projectInput = (title = "Backyard") => ({
  title,
  spaceType: "backyard",
  analysis: { summary: "A yard", suggestions: [] },
  keep: [{ id: "shed", label: "Shed", keep: true }],
  calibration: null,
});
const request = { message: "add a fence", drawings: [], keep: [], fromOriginal: false };

beforeAll(async () => {
  await ensureDatabase(url);
  const c = createDb(url, { max: 10 });
  db = c.db;
  close = c.close;
  await runMigrations(db);
});

afterAll(async () => {
  await close();
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user", profiles, projects, versions, messages, credit_ledger, edit_jobs RESTART IDENTITY CASCADE`);
  await makeUser("alice");
  await makeUser("bob");
});

describe("ensureDatabase", () => {
  it("creates a missing database once and leaves an existing one alone", async () => {
    const name = `architech_ensure_${Date.now()}`;
    const target = url.replace(/\/[^/]+$/, `/${name}`);
    const exists = async () => (await db.execute(sql`select 1 from pg_database where datname = ${name}`)).length > 0;
    try {
      expect(await exists()).toBe(false);
      await ensureDatabase(target);
      expect(await exists()).toBe(true);
      await ensureDatabase(target);
      expect(await exists()).toBe(true);
    } finally {
      await db.execute(sql.raw(`drop database if exists ${name}`));
    }
  });

  it("refuses names that aren't plain identifiers", async () => {
    await expect(ensureDatabase(url.replace(/\/[^/]+$/, "/bad;drop"))).rejects.toThrow(/database name/i);
  });
});

describe("credits", () => {
  it("gives 20 free credits once", async () => {
    await ensureProfile(db, "alice");
    expect(await getCredits(db, "alice")).toBe(20);
  });

  it("never goes below zero under concurrent edits", async () => {
    const { project } = await createProject(db, "alice", projectInput(), original);
    const results = await Promise.allSettled(
      Array.from({ length: 25 }, () => enqueueJob(db, { userId: "alice", projectId: project.id, baseKey: "k", spaceType: "backyard", request, calibration: null, history: [], skipRateLimit: true })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(20);
    expect(results.filter((r) => r.status === "rejected" && r.reason instanceof OutOfCreditsError)).toHaveLength(5);
    expect(await getCredits(db, "alice")).toBe(0);
  });
});

describe("projects", () => {
  it(`allows at most ${MAX_SERVER_PROJECTS} projects on the server per user`, async () => {
    for (let i = 0; i < MAX_SERVER_PROJECTS; i++) await createProject(db, "alice", projectInput(`P${i}`), original);
    await expect(createProject(db, "alice", projectInput("one too many"), original)).rejects.toBeInstanceOf(ProjectLimitError);
    await createProject(db, "bob", projectInput(), original);
  });

  it("enforces the limit even with simultaneous requests from web and phone", async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => createProject(db, "alice", projectInput(`P${i}`), original)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(MAX_SERVER_PROJECTS);
    expect(await listProjects(db, "alice")).toHaveLength(MAX_SERVER_PROJECTS);
  });

  it("creates the original version and lists projects with a cover", async () => {
    const { project, version } = await createProject(db, "alice", projectInput(), original);
    expect(version.number).toBe(0);
    expect(version.label).toBe("Original");
    const list = await listProjects(db, "alice");
    expect(list[0]!.coverThumbKey).toBe("k/orig-thumb.jpg");
    expect(list[0]!.versionCount).toBe(1);
    expect(list[0]!.id).toBe(project.id);
  });

  it("hides other users' projects", async () => {
    const { project } = await createProject(db, "alice", projectInput(), original);
    expect(await getProject(db, "bob", project.id)).toBeNull();
    expect(await getProject(db, "alice", project.id)).not.toBeNull();
    await expect(deleteProject(db, "bob", project.id)).resolves.toBe(false);
  });

  it("updates title, keep list and calibration", async () => {
    const { project } = await createProject(db, "alice", projectInput(), original);
    const cal = { imageWidth: 100, imageHeight: 80, references: [], units: "metric" as const };
    const updated = await updateProject(db, "alice", project.id, { title: "Yard", keep: [], calibration: cal });
    expect(updated!.title).toBe("Yard");
    expect(updated!.calibration).toEqual(cal);
  });

  it("numbers new versions and stores chat messages", async () => {
    const { project, version } = await createProject(db, "alice", projectInput(), original);
    const v1 = await addVersion(db, { projectId: project.id, parentId: version.id, label: "Fence", imageKey: "a", thumbKey: "b", width: 10, height: 10, request, prompt: "p", verified: true, problems: [] });
    expect(v1.number).toBe(1);
    await addMessage(db, { projectId: project.id, role: "user", content: "add a fence" });
    expect(await listVersions(db, project.id)).toHaveLength(2);
    expect((await listMessages(db, project.id))[0]!.content).toBe("add a fence");
  });

  it("frees a slot when a project is deleted", async () => {
    const created = [];
    for (let i = 0; i < MAX_SERVER_PROJECTS; i++) created.push((await createProject(db, "alice", projectInput(`P${i}`), original)).project);
    expect(await deleteProject(db, "alice", created[0]!.id)).toBe(true);
    await createProject(db, "alice", projectInput("new"), original);
  });
});

describe("edit jobs", () => {
  const job = (projectId: string | null, extra: Partial<Parameters<typeof enqueueJob>[1]> = {}) => ({
    userId: "alice",
    projectId,
    baseKey: "k/base.jpg",
    spaceType: "backyard",
    request,
    calibration: null,
    history: [],
    ...extra,
  });

  it("reserves a credit when queued and rate limits bursts", async () => {
    const { project } = await createProject(db, "alice", projectInput(), original);
    for (let i = 0; i < 4; i++) await enqueueJob(db, job(project.id));
    expect(await getCredits(db, "alice")).toBe(16);
    await expect(enqueueJob(db, job(project.id))).rejects.toBeInstanceOf(RateLimitError);
  });

  it("runs free retries without charging", async () => {
    const j = await enqueueJob(db, job(null, { free: true }));
    expect(j.charged).toBe(false);
    expect(await getCredits(db, "alice")).toBe(20);
  });

  it("refuses edits with no credits left", async () => {
    await db.update(schema.profiles).set({ credits: 0 });
    await expect(enqueueJob(db, job(null))).rejects.toBeInstanceOf(OutOfCreditsError);
  });

  it("hands each queued job to exactly one worker", async () => {
    for (let i = 0; i < 3; i++) await enqueueJob(db, job(null, { skipRateLimit: true }));
    const claims = await Promise.all(Array.from({ length: 6 }, () => claimNextJob(db)));
    const ids = claims.filter(Boolean).map((c) => c!.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });

  it("saves a verified result as a new version with the assistant reply", async () => {
    const { project, version } = await createProject(db, "alice", projectInput(), original);
    const queued = await enqueueJob(db, job(project.id, { baseVersionId: version.id }));
    await claimNextJob(db);
    const done = await completeJob(db, queued.id, {
      resultKey: "r.jpg",
      thumbKey: "r-thumb.jpg",
      width: 1536,
      height: 1024,
      reply: "Your fence is in!",
      followUps: ["Add a gate"],
      prompt: "p",
      verified: true,
      problems: [],
      attempts: 1,
      label: "Fence",
    });
    expect(done.status).toBe("succeeded");
    const versions = await listVersions(db, project.id);
    expect(versions.map((v) => v.label)).toEqual(["Original", "Fence"]);
    expect(done.versionId).toBe(versions[1]!.id);
    const msgs = await listMessages(db, project.id);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(msgs[1]!.followUps).toEqual(["Add a gate"]);
    expect(await getCredits(db, "alice")).toBe(19);
  });

  it("keeps an obsolete design render in history without replacing the current cover", async () => {
    const { project, version } = await createProject(db, "alice", projectInput(), original);
    const design = designAlternativeSchema.parse({ id: "layout", name: "Patio", revision: 1 });
    const planning = planningSchema.parse({ revision: 1, activeId: design.id, alternatives: [design] });
    await updateProject(db, "alice", project.id, { planning }, 0);
    const queued = await enqueueJob(db, job(project.id, { baseVersionId: version.id, request: { ...request, design } }));
    await claimNextJob(db);
    await updateProject(db, "alice", project.id, { planning: { ...planning, revision: 2, alternatives: [{ ...design, revision: 2 }] } }, 1);
    await completeJob(db, queued.id, { resultKey: "old.jpg", thumbKey: "old-thumb.jpg", width: 100, height: 100, reply: "Earlier plan", followUps: [], prompt: "", verified: true, problems: [], attempts: 1, label: "Earlier design" });
    expect(await listVersions(db, project.id)).toHaveLength(2);
    expect((await getProject(db, "alice", project.id))?.coverVersionId).toBe(version.id);
  });

  it("refunds unverified results and failures", async () => {
    const a = await enqueueJob(db, job(null));
    await claimNextJob(db);
    await completeJob(db, a.id, { resultKey: "r", thumbKey: "t", width: 1, height: 1, reply: "", followUps: [], prompt: "", verified: false, problems: ["window moved"], attempts: 3, label: "Edit" });
    expect(await getCredits(db, "alice")).toBe(20);
    const b = await enqueueJob(db, job(null));
    await claimNextJob(db);
    await failJob(db, b.id, "The AI is busy");
    expect(await getCredits(db, "alice")).toBe(20);
    expect((await getJob(db, "alice", b.id))!.status).toBe("failed");
    expect(await getJob(db, "bob", b.id)).toBeNull();
  });

  it("puts stuck jobs back in the queue", async () => {
    const a = await enqueueJob(db, job(null));
    await claimNextJob(db);
    await db.update(schema.editJobs).set({ heartbeatAt: new Date(Date.now() - 20 * 60_000) });
    expect(await requeueStaleJobs(db, 10 * 60_000)).toBe(1);
    expect((await getJob(db, "alice", a.id))!.status).toBe("queued");
  });

  it("gives one free 'Something's wrong' retry per finished edit", async () => {
    const { project, version } = await createProject(db, "alice", projectInput(), original);
    const first = await enqueueJob(db, job(project.id, { baseVersionId: version.id }));
    await expect(retryJob(db, "alice", first.id)).rejects.toBeInstanceOf(RetryNotAllowedError);
    await claimNextJob(db);
    await completeJob(db, first.id, { resultKey: "r", thumbKey: "t", width: 1, height: 1, reply: "", followUps: [], prompt: "", verified: true, problems: [], attempts: 1, label: "Fence" });
    await expect(retryJob(db, "bob", first.id)).rejects.toBeInstanceOf(RetryNotAllowedError);
    const retry = await retryJob(db, "alice", first.id, "The window is gone");
    expect(retry.free).toBe(true);
    expect(retry.baseKey).toBe(first.baseKey);
    expect(retry.baseVersionId).toBe(version.id);
    expect(retry.history.at(-1)!.content).toMatch(/window is gone/);
    expect(await getCredits(db, "alice")).toBe(19);
    const again = await Promise.allSettled([retryJob(db, "alice", first.id), retryJob(db, "alice", first.id)]);
    expect(again.every((r) => r.status === "rejected" && r.reason instanceof RetryNotAllowedError)).toBe(true);
  });

  it("forgets finished device-project jobs after a while but keeps server ones", async () => {
    const { project } = await createProject(db, "alice", projectInput(), original);
    const device = await enqueueJob(db, job(null, { skipRateLimit: true }));
    const server = await enqueueJob(db, job(project.id, { skipRateLimit: true }));
    for (const j of [device, server]) await failJob(db, j.id, "x");
    await db.update(schema.editJobs).set({ finishedAt: new Date(Date.now() - 3 * 86_400_000) });
    const purged = await purgeDeviceJobs(db, 86_400_000);
    expect(purged.map((p) => p.id)).toEqual([device.id]);
    expect(await getJob(db, "alice", device.id)).toBeNull();
    expect(await getJob(db, "alice", server.id)).not.toBeNull();
  });
});
