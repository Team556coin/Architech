import type { Drawing } from "@architech/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, canRedoFree, chipsFor, clearPendingJob, history, loadDraftDrawings, loadPendingJob, previousVersionId, saveDraftDrawings, savePendingJob } from "./editor-logic";
import type { CProject } from "./types";

const v = (id: string, number: number) => ({ id, number, label: number ? `V${number}` : "Original", url: "", thumbUrl: "", width: 10, height: 10, request: null, verified: true, problems: [], createdAt: "" });

const project: CProject = {
  id: "p1",
  where: "server",
  title: "Backyard",
  spaceType: "backyard",
  analysis: { summary: "", suggestions: [{ label: "Add a fence", prompt: "Add a 6 ft cedar privacy fence" }] },
  keep: [{ id: "shed", label: "Shed", keep: true }],
  calibration: null,
  coverVersionId: "b",
  versions: [v("a", 0), v("b", 1), v("c", 2)],
  messages: [{ id: "m1", role: "assistant", content: "Fence is in!", versionId: "b", followUps: ["Add a gate", "Darker stain"], createdAt: "" }],
  createdAt: "",
  updatedAt: "",
};

const fence: Drawing = {
  id: "d1",
  number: 3,
  itemType: "fence",
  kind: "line",
  shape: "polyline",
  points: [
    { x: 0.1, y: 0.8 },
    { x: 0.9, y: 0.8 },
  ],
  zoneHeight: 0.2,
  options: {},
  note: "",
  dims: {},
};

describe("editor logic", () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
      clear: () => data.clear(),
    });
  });

  it("undoes and redoes steps", () => {
    let h = history.init(1);
    h = history.push(h, 2);
    h = history.push(h, 3);
    h = history.undo(h);
    expect(h.present).toBe(2);
    h = history.redo(h);
    expect(h.present).toBe(3);
    h = history.undo(history.undo(history.undo(h)));
    expect(h.present).toBe(1);
    expect(history.canUndo(h)).toBe(false);
  });

  it("makes one undo step for a whole drag", () => {
    let h = history.init("start");
    h = history.set(h, "drag-1");
    h = history.set(h, "drag-2");
    h = history.push(h, "drag-2");
    expect(h.past).toEqual(["start"]);
    expect(history.undo(h).present).toBe("start");
    const same = history.push(h, h.present);
    expect(same).toBe(h);
  });

  it("keeps unfinished drawings for this project", () => {
    saveDraftDrawings("p9", [fence]);
    expect(loadDraftDrawings("p9")).toEqual([fence]);
    saveDraftDrawings("p9", []);
    expect(loadDraftDrawings("p9")).toEqual([]);
  });

  it("builds a request from chat text and finished drawings", () => {
    const half = { ...fence, id: "d2", points: [fence.points[0]!] };
    const r = buildRequest({ message: "  make it cedar ", drawings: [fence, half], keep: project.keep });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.request.message).toBe("make it cedar");
      expect(r.request.drawings).toHaveLength(1);
      expect(r.request.drawings[0]!.number).toBe(1);
    }
    expect(buildRequest({ message: " ", drawings: [half], keep: [] }).ok).toBe(false);
  });

  it("offers the follow-ups for the picked version, or the photo's ideas", () => {
    expect(chipsFor(project, "b").map((c) => c.label)).toEqual(["Add a gate", "Darker stain"]);
    expect(chipsFor(project, "a")).toEqual([{ label: "Add a fence", prompt: "Add a 6 ft cedar privacy fence" }]);
  });

  it("remembers an edit that is still running", () => {
    savePendingJob("d-1", { jobId: "j1", request: { message: "x", drawings: [], keep: [], fromOriginal: false } });
    expect(loadPendingJob("d-1")?.jobId).toBe("j1");
    clearPendingJob("d-1");
    expect(loadPendingJob("d-1")).toBeNull();
  });

  it("steps back to the version before", () => {
    expect(previousVersionId(project, "c")).toBe("b");
    expect(previousVersionId(project, "a")).toBeNull();
  });
});

describe("canRedoFree", () => {
  const made = (id: string, number: number, jobId: string | null, retryOfJobId: string | null = null) => ({ ...v(id, number), jobId, retryOfJobId });

  it("allows one free redo of an AI edit", () => {
    const versions = [made("o", 0, null), made("a", 1, "j1")];
    expect(canRedoFree(versions, versions[1]!)).toBe(true);
  });

  it("not for the original or versions with no edit job (e.g. imported)", () => {
    const versions = [made("o", 0, null), made("a", 1, null)];
    expect(canRedoFree(versions, versions[0]!)).toBe(false);
    expect(canRedoFree(versions, versions[1]!)).toBe(false);
  });

  it("not again once it's been redone, and not for the redo itself", () => {
    const versions = [made("o", 0, null), made("a", 1, "j1"), made("b", 2, "j2", "j1")];
    expect(canRedoFree(versions, versions[1]!)).toBe(false);
    expect(canRedoFree(versions, versions[2]!)).toBe(false);
  });
});
