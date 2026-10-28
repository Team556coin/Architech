import { MAX_SERVER_PROJECTS, designAlternativeSchema, newDesignItem, planningSchema } from "@architech/core";
import { runMigrations } from "@architech/db";
import { sql } from "drizzle-orm";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as authRoute from "@/app/api/auth/[...all]/route";
import * as editRetry from "@/app/api/edits/[id]/retry/route";
import * as editOne from "@/app/api/edits/[id]/route";
import * as edits from "@/app/api/edits/route";
import * as files from "@/app/api/files/[...key]/route";
import * as me from "@/app/api/me/route";
import * as photos from "@/app/api/photos/route";
import * as projectsImport from "@/app/api/projects/import/route";
import * as projectOne from "@/app/api/projects/[id]/route";
import * as projects from "@/app/api/projects/route";
import { db } from "./db";
import { resetLimiter } from "./limiter";
import { ensureBucket } from "./storage";
import { drainQueue } from "./worker";

const BASE = "http://localhost:3000";

async function jpeg(w = 640, h = 480, color = "#88aa66") {
  return sharp({ create: { width: w, height: h, channels: 3, background: color } }).jpeg().toBuffer();
}

async function signUp(email: string): Promise<string> {
  const res = await authRoute.POST(
    new Request(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ email, password: "hunter22", name: email.split("@")[0] }),
    }),
  );
  expect(res.status).toBe(200);
  const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0]);
  return cookies.join("; ");
}

interface CallOpts {
  cookie?: string;
  json?: unknown;
  form?: FormData;
  params?: Record<string, string | string[]>;
}

type Handler = (req: Request, ctx: { params: Promise<never> }) => Promise<Response>;

async function call(handler: unknown, method: string, path: string, o: CallOpts = {}) {
  const headers: Record<string, string> = { origin: BASE };
  if (o.cookie) headers.cookie = o.cookie;
  let body: BodyInit | undefined;
  if (o.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(o.json);
  } else if (o.form) body = o.form;
  const res = await (handler as Handler)(new Request(`${BASE}${path}`, { method, headers, body }), { params: Promise.resolve(o.params ?? {}) as Promise<never> });
  const type = res.headers.get("content-type") ?? "";
  const data = type.includes("json") ? await res.json() : await res.arrayBuffer();
  return { status: res.status, data: data as any, res };
}

async function uploadPhoto(cookie: string, analyze = true) {
  const form = new FormData();
  form.set("photo", new Blob([new Uint8Array(await jpeg())], { type: "image/jpeg" }), "yard.jpg");
  if (!analyze) form.set("analyze", "false");
  return call(photos.POST, "POST", "/api/photos", { cookie, form });
}

async function newProject(cookie: string, title = "Backyard") {
  const photo = await uploadPhoto(cookie, false);
  return call(projects.POST, "POST", "/api/projects", {
    cookie,
    json: { photoKey: photo.data.key, title, spaceType: "backyard", keep: [{ id: "shed", label: "Shed", keep: true }] },
  });
}

const fileParams = (url: string) => ({ key: url.replace("/api/files/", "").split("/") });

beforeAll(async () => {
  await runMigrations(db());
  await ensureBucket();
});

beforeEach(async () => {
  resetLimiter();
  await db().execute(sql`TRUNCATE "user", session, account, verification, profiles, projects, versions, messages, credit_ledger, edit_jobs RESTART IDENTITY CASCADE`);
});

describe("account", () => {
  it("starts signed out, then signs up with 20 free edits", async () => {
    expect((await call(me.GET, "GET", "/api/me")).data.user).toBeNull();
    const cookie = await signUp("sam@example.com");
    const { data } = await call(me.GET, "GET", "/api/me", { cookie });
    expect(data.user.email).toBe("sam@example.com");
    expect(data.credits).toBe(20);
    expect(data.serverProjects).toBe(0);
    expect(data.maxServerProjects).toBe(MAX_SERVER_PROJECTS);
    expect((await call(me.PATCH, "PATCH", "/api/me", { cookie, json: { units: "metric" } })).status).toBe(200);
    expect((await call(me.GET, "GET", "/api/me", { cookie })).data.units).toBe("metric");
  });
});

describe("planning persistence", () => {
  it("round-trips alternatives and rejects conflicting saves without losing the saved plan", async () => {
    const cookie = await signUp("planner@example.com");
    const created = await newProject(cookie);
    const id = created.data.project.id;
    const design = designAlternativeSchema.parse({ id: "a", name: "Covered patio", items: [newDesignItem("patio-cover", "roof")] });
    const planning = planningSchema.parse({ revision: 1, activeId: "a", alternatives: [design] });
    const saved = await call(projectOne.PATCH, "PATCH", `/api/projects/${id}`, { cookie, params: { id }, json: { planning, expectedPlanningRevision: 0 } });
    expect(saved.status).toBe(200);
    expect(saved.data.project.planning.alternatives[0].items[0].type).toBe("patio-cover");
    const conflict = await call(projectOne.PATCH, "PATCH", `/api/projects/${id}`, { cookie, params: { id }, json: { planning, expectedPlanningRevision: 0 } });
    expect(conflict.status).toBe(409);
    const loaded = await call(projectOne.GET, "GET", `/api/projects/${id}`, { cookie, params: { id } });
    expect(loaded.data.project.planning).toEqual(planning);
    const other = await signUp("other-planner@example.com");
    expect((await call(projectOne.PATCH, "PATCH", `/api/projects/${id}`, { cookie: other, params: { id }, json: { planning: { ...planning, revision: 2 }, expectedPlanningRevision: 1 } })).status).toBe(404);
  });
});

describe("photos", () => {
  it("prepares the photo and describes the space", async () => {
    const cookie = await signUp("sam@example.com");
    const { status, data } = await uploadPhoto(cookie);
    expect(status).toBe(201);
    expect(data.key).toMatch(/^tmp\//);
    expect(data.width).toBe(640);
    expect(data.analysis.suggestions.length).toBeGreaterThan(0);
    const img = await call(files.GET, "GET", data.url, { cookie, params: fileParams(data.url) });
    expect(img.status).toBe(200);
    expect(img.res.headers.get("content-type")).toBe("image/jpeg");
  });

  it("needs sign in and a real picture", async () => {
    expect((await uploadPhoto("")).status).toBe(401);
    const cookie = await signUp("sam@example.com");
    const form = new FormData();
    form.set("photo", new Blob(["not a photo"], { type: "image/jpeg" }), "x.jpg");
    const bad = await call(photos.POST, "POST", "/api/photos", { cookie, form });
    expect(bad.status).toBe(415);
    expect(bad.data.error).toMatch(/photo/i);
  });
});

describe("projects on the server", () => {
  it("creates, lists, renames and deletes a project", async () => {
    const cookie = await signUp("sam@example.com");
    const created = await newProject(cookie);
    expect(created.status).toBe(201);
    const id = created.data.project.id;
    const list = await call(projects.GET, "GET", "/api/projects", { cookie });
    expect(list.data.projects).toHaveLength(1);
    expect(list.data.projects[0].coverUrl).toMatch(/^\/api\/files\/u\//);
    expect(list.data.max).toBe(5);

    const renamed = await call(projectOne.PATCH, "PATCH", `/api/projects/${id}`, { cookie, json: { title: "Back yard" }, params: { id } });
    expect(renamed.data.project.title).toBe("Back yard");

    const full = await call(projectOne.GET, "GET", `/api/projects/${id}`, { cookie, params: { id } });
    expect(full.data.versions).toHaveLength(1);
    const url = full.data.versions[0].url;
    expect((await call(files.GET, "GET", url, { cookie, params: fileParams(url) })).status).toBe(200);

    expect((await call(projectOne.DELETE, "DELETE", `/api/projects/${id}`, { cookie, params: { id } })).status).toBe(200);
    expect((await call(files.GET, "GET", url, { cookie, params: fileParams(url) })).status).toBe(404);
  });

  it(`keeps at most ${MAX_SERVER_PROJECTS} projects on the server`, async () => {
    const cookie = await signUp("sam@example.com");
    for (let i = 0; i < MAX_SERVER_PROJECTS; i++) expect((await newProject(cookie, `P${i}`)).status).toBe(201);
    const extra = await newProject(cookie, "Too many");
    expect(extra.status).toBe(409);
    expect(extra.data.code).toBe("project_limit");
  });

  it("never shows one person's pictures or projects to someone else", async () => {
    const sam = await signUp("sam@example.com");
    const eve = await signUp("eve@example.com");
    const { data } = await newProject(sam);
    const id = data.project.id;
    expect((await call(projectOne.GET, "GET", `/api/projects/${id}`, { cookie: eve, params: { id } })).status).toBe(404);
    const full = await call(projectOne.GET, "GET", `/api/projects/${id}`, { cookie: sam, params: { id } });
    const url = full.data.versions[0].url;
    expect((await call(files.GET, "GET", url, { cookie: eve, params: fileParams(url) })).status).toBe(404);
    const stolen = await uploadPhoto(sam, false);
    const res = await call(projects.POST, "POST", "/api/projects", { cookie: eve, json: { photoKey: stolen.data.key, title: "Mine", spaceType: "backyard" } });
    expect(res.status).toBe(400);
  });
});

describe("edits", () => {
  it("edits a server project, saves the version, and gives one free redo", async () => {
    const cookie = await signUp("sam@example.com");
    const { data } = await newProject(cookie);
    const id = data.project.id;
    const queued = await call(edits.POST, "POST", "/api/edits", { cookie, json: { projectId: id, request: { message: "Add a cedar privacy fence" } } });
    expect(queued.status).toBe(202);
    expect(queued.data.job.status).toBe("queued");
    expect((await call(me.GET, "GET", "/api/me", { cookie })).data.credits).toBe(19);

    expect(await drainQueue()).toBe(1);
    const jobId = queued.data.job.id;
    const done = await call(editOne.GET, "GET", `/api/edits/${jobId}`, { cookie, params: { id: jobId } });
    expect(done.data.job.status).toBe("succeeded");
    expect(done.data.job.verified).toBe(true);
    expect(done.data.job.reply).toMatch(/Done/);

    const full = await call(projectOne.GET, "GET", `/api/projects/${id}`, { cookie, params: { id } });
    expect(full.data.versions.map((v: { label: string }) => v.label)).toEqual(["Original", "Add a cedar privacy fence"]);
    expect(full.data.messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant"]);
    expect(full.data.project.coverVersionId).toBe(done.data.job.versionId);

    const redo = await call(editRetry.POST, "POST", `/api/edits/${jobId}/retry`, { cookie, json: { complaint: "The shed disappeared" }, params: { id: jobId } });
    expect(redo.status).toBe(202);
    expect(redo.data.job.free).toBe(true);
    await drainQueue();
    expect((await call(me.GET, "GET", "/api/me", { cookie })).data.credits).toBe(19);
    const again = await call(editRetry.POST, "POST", `/api/edits/${jobId}/retry`, { cookie, params: { id: jobId } });
    expect(again.status).toBe(409);
  });

  it("edits a project that lives on the device using a short-lived upload", async () => {
    const cookie = await signUp("sam@example.com");
    const photo = await uploadPhoto(cookie, false);
    const queued = await call(edits.POST, "POST", "/api/edits", {
      cookie,
      json: { baseKey: photo.data.key, spaceType: "bathroom", request: { message: "Walk-in shower" }, history: [{ role: "user", content: "hi" }] },
    });
    expect(queued.status).toBe(202);
    await drainQueue();
    const jobId = queued.data.job.id;
    const done = await call(editOne.GET, "GET", `/api/edits/${jobId}`, { cookie, params: { id: jobId } });
    expect(done.data.job.resultUrl).toMatch(/^\/api\/files\/tmp\//);
    const img = await call(files.GET, "GET", done.data.job.resultUrl, { cookie, params: fileParams(done.data.job.resultUrl) });
    expect(img.status).toBe(200);
    const meta = await sharp(Buffer.from(img.data as ArrayBuffer)).metadata();
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(480);
  });

  it("rejects empty requests and other people's uploads", async () => {
    const sam = await signUp("sam@example.com");
    const eve = await signUp("eve@example.com");
    const photo = await uploadPhoto(sam, false);
    const empty = await call(edits.POST, "POST", "/api/edits", { cookie: sam, json: { baseKey: photo.data.key, spaceType: "backyard", request: { message: " " } } });
    expect(empty.status).toBe(400);
    const theft = await call(edits.POST, "POST", "/api/edits", { cookie: eve, json: { baseKey: photo.data.key, spaceType: "backyard", request: { message: "fence" } } });
    expect(theft.status).toBe(400);
    expect((await call(me.GET, "GET", "/api/me", { cookie: eve })).data.credits).toBe(20);
  });

  it("tells people when they are out of edits", async () => {
    const cookie = await signUp("sam@example.com");
    await db().execute(sql`update profiles set credits = 0`);
    const photo = await uploadPhoto(cookie, false);
    const res = await call(edits.POST, "POST", "/api/edits", { cookie, json: { baseKey: photo.data.key, spaceType: "backyard", request: { message: "fence" } } });
    expect(res.status).toBe(402);
    expect(res.data.code).toBe("out_of_credits");
  });
});

describe("moving projects between device and server", () => {
  async function bundleForm(versions = 2) {
    const form = new FormData();
    form.set(
      "bundle",
      JSON.stringify({
        title: "Bathroom",
        spaceType: "bathroom",
        keep: [{ id: "window", label: "Window", keep: true }],
        versions: Array.from({ length: versions }, (_, i) => ({ label: i === 0 ? "Original" : `Edit ${i}` })),
        messages: [
          { role: "user", content: "walk-in shower" },
          { role: "assistant", content: "Done!", versionIndex: 1, followUps: ["Darker tile"] },
        ],
        coverIndex: versions - 1,
      }),
    );
    for (let i = 0; i < versions; i++) form.set(`v${i}`, new Blob([new Uint8Array(await jpeg(400, 300, i ? "#3366aa" : "#aa6633"))], { type: "image/jpeg" }));
    return form;
  }

  it("moves a device project to the server with its versions and chat", async () => {
    const cookie = await signUp("sam@example.com");
    const res = await call(projectsImport.POST, "POST", "/api/projects/import", { cookie, form: await bundleForm() });
    expect(res.status).toBe(201);
    const id = res.data.project.id;
    const full = await call(projectOne.GET, "GET", `/api/projects/${id}`, { cookie, params: { id } });
    expect(full.data.versions.map((v: { label: string }) => v.label)).toEqual(["Original", "Edit 1"]);
    expect(full.data.messages[1].versionId).toBe(full.data.versions[1].id);
    expect(full.data.project.coverVersionId).toBe(full.data.versions[1].id);
  });

  it("refuses to move a sixth project to the server", async () => {
    const cookie = await signUp("sam@example.com");
    for (let i = 0; i < MAX_SERVER_PROJECTS; i++) await newProject(cookie, `P${i}`);
    const res = await call(projectsImport.POST, "POST", "/api/projects/import", { cookie, form: await bundleForm(1) });
    expect(res.status).toBe(409);
  });
});
