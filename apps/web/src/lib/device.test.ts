import "fake-indexeddb/auto";
import { designAlternativeSchema, newDesignItem, planningSchema } from "@architech/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addDeviceVersion,
  createDeviceProject,
  deleteDeviceProject,
  getBlob,
  getDeviceProject,
  listDeviceProjects,
  resetDeviceStore,
  saveDevicePlanning,
  stashPendingPhoto,
  takePendingPhoto,
  thumbKey,
  type DeviceProject,
} from "./device-store";
import { buildImportBundle, listAll, moveToServer } from "./projects";

const blob = (s: string) => new Blob([s], { type: "image/jpeg" });

function project(id: string, userId = "u1", updatedAt = "2026-10-17T10:00:00.000Z"): DeviceProject {
  return {
    id,
    userId,
    title: "Backyard",
    spaceType: "backyard",
    analysis: { summary: "", suggestions: [] },
    keep: [{ id: "shed", label: "Shed", keep: true }],
    calibration: null,
    coverVersionId: "v0",
    versions: [{ id: "v0", number: 0, label: "Original", width: 10, height: 8, request: null, prompt: null, verified: true, problems: [], jobId: null, createdAt: updatedAt }],
    messages: [],
    createdAt: updatedAt,
    updatedAt,
  };
}

beforeEach(async () => {
  await resetDeviceStore();
  indexedDB.deleteDatabase("architech");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("device store", () => {
  it("saves a plan transactionally and includes it when moving to the server", async () => {
    await createDeviceProject(project("d-plan"), {});
    const planning = planningSchema.parse({ revision: 1, activeId: "a", alternatives: [designAlternativeSchema.parse({ id: "a", name: "Gazebo", items: [newDesignItem("gazebo", "g")] })] });
    const saved = await saveDevicePlanning("d-plan", planning, 0);
    expect(buildImportBundle(saved).bundle.planning).toEqual(planning);
    await expect(saveDevicePlanning("d-plan", planning, 0)).rejects.toThrow(/changed/);
    expect((await getDeviceProject("d-plan"))?.planning).toEqual(planning);
  });
  it("keeps each person's projects separate and newest first", async () => {
    await createDeviceProject(project("d-1", "u1", "2026-10-17T10:00:00.000Z"), { v0: { image: blob("a"), thumb: blob("t") } });
    await createDeviceProject({ ...project("d-2", "u1", "2026-10-17T11:00:00.000Z"), versions: [] }, {});
    await createDeviceProject(project("d-3", "u2"), {});
    expect((await listDeviceProjects("u1")).map((p) => p.id)).toEqual(["d-2", "d-1"]);
    expect(await (await getBlob("v0"))!.text()).toBe("a");
    expect(await (await getBlob(thumbKey("v0")))!.text()).toBe("t");
  });

  it("adds versions with the next number and the chat messages", async () => {
    await createDeviceProject(project("d-1"), { v0: { image: blob("a"), thumb: blob("t") } });
    const v = { id: "v1", number: 0, label: "Fence", width: 10, height: 8, request: null, prompt: null, verified: true, problems: [], jobId: "j1", createdAt: "" };
    const msgs = [{ id: "m1", role: "assistant" as const, content: "Done", versionId: "v1", followUps: [], createdAt: "" }];
    const next = await addDeviceVersion("d-1", v, blob("b"), blob("bt"), msgs);
    expect(next.versions.map((x) => x.number)).toEqual([0, 1]);
    expect(next.coverVersionId).toBe("v1");
    expect(next.messages).toHaveLength(1);
  });

  it("deletes a project with all its pictures", async () => {
    await createDeviceProject(project("d-1"), { v0: { image: blob("a"), thumb: blob("t") } });
    await deleteDeviceProject("d-1");
    expect(await getDeviceProject("d-1")).toBeUndefined();
    expect(await getBlob("v0")).toBeUndefined();
  });

  it("remembers a photo picked before signing in, once", async () => {
    await stashPendingPhoto(blob("photo"));
    expect(await (await takePendingPhoto())!.text()).toBe("photo");
    expect(await takePendingPhoto()).toBeNull();
  });
});

describe("moving to the server", () => {
  it("packs versions in order and links chat messages to them", () => {
    const p = project("d-1");
    p.versions.push({ ...p.versions[0]!, id: "v1", number: 1, label: "Fence" });
    p.coverVersionId = "v1";
    p.messages = [
      { id: "m1", role: "user", content: "fence", versionId: null, followUps: [], createdAt: "" },
      { id: "m2", role: "assistant", content: "Done", versionId: "v1", followUps: ["Add a gate"], createdAt: "" },
    ];
    const { order, bundle } = buildImportBundle(p);
    expect(order).toEqual(["v0", "v1"]);
    expect(bundle.versions.map((v) => v.label)).toEqual(["Original", "Fence"]);
    expect(bundle.messages[1]).toMatchObject({ versionIndex: 1, followUps: ["Add a gate"] });
    expect(bundle.coverIndex).toBe(1);
  });

  it("uploads the project and removes it from the device", async () => {
    await createDeviceProject(project("d-1"), { v0: { image: blob("a"), thumb: blob("t") } });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("/api/projects/import");
      const form = init!.body as FormData;
      expect(JSON.parse(form.get("bundle") as string).title).toBe("Backyard");
      expect(form.get("v0")).toBeInstanceOf(Blob);
      return Response.json({ project: { id: "srv-1" }, versionIds: ["x"] }, { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await moveToServer("d-1")).toBe("srv-1");
    expect(await getDeviceProject("d-1")).toBeUndefined();
  });

  it("keeps the project on the device when the server is full", async () => {
    await createDeviceProject(project("d-1"), { v0: { image: blob("a"), thumb: blob("t") } });
    vi.stubGlobal("fetch", async () => Response.json({ error: "full", code: "project_limit" }, { status: 409 }));
    await expect(moveToServer("d-1")).rejects.toMatchObject({ code: "project_limit" });
    expect(await getDeviceProject("d-1")).toBeDefined();
  });
});

describe("listing everything", () => {
  it("merges server and device projects and still works offline", async () => {
    await createDeviceProject(project("d-1", "u1", "2026-10-17T12:00:00.000Z"), { v0: { image: blob("a"), thumb: blob("t") } });
    vi.stubGlobal("fetch", async () =>
      Response.json({ projects: [{ id: "s-1", title: "Kitchen", spaceType: "kitchen", updatedAt: "2026-10-17T09:00:00.000Z", coverUrl: null, originalUrl: null, versionCount: 2 }], max: 5 }),
    );
    const all = await listAll("u1");
    expect(all.projects.map((p) => [p.id, p.where])).toEqual([
      ["d-1", "device"],
      ["s-1", "server"],
    ]);
    expect(all.serverCount).toBe(1);
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("offline");
    });
    const off = await listAll("u1");
    expect(off.offline).toBe(true);
    expect(off.projects).toHaveLength(1);
  });
});
