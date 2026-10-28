import { describe, expect, it } from "vitest";
import { judge, normalizeAnalysis, normalizeOccluders, rewriteProblem } from "./agents";

describe("normalizeAnalysis", () => {
  it("cleans ids, clamps coordinates and drops bad references", () => {
    const out = normalizeAnalysis({
      spaceType: "bathroom",
      title: "  My Bathroom ",
      summary: "A dated bathroom.",
      keep: [
        { id: "Window", label: "Window" },
        { id: "window", label: "Window 2" },
        { id: "", label: "Tub location" },
      ],
      suggestions: [{ label: "Modern spa", prompt: "Make it a modern spa." }],
      horizonY: 0.4,
      references: [
        { label: "Door", kind: "vertical", ax: 0.1, ay: 1.2, bx: 0.1, by: 0.3, lengthM: 2.03 },
        { label: "Huge", kind: "ground", ax: 0.1, ay: 0.9, bx: 0.9, by: 0.9, lengthM: 99 },
        { label: "Dot", kind: "ground", ax: 0.5, ay: 0.9, bx: 0.505, by: 0.9, lengthM: 1 },
      ],
    });
    expect(out.title).toBe("My Bathroom");
    expect(out.keep.map((k) => k.id)).toEqual(["window", "window-2", "tub-location"]);
    expect(out.keep.every((k) => k.keep)).toBe(true);
    expect(out.references).toHaveLength(1);
    expect(out.references[0]!.a.y).toBe(1);
    expect(out.references[0]!.source).toBe("estimated");
  });
});

describe("rewriteProblem", () => {
  it("keeps the car and runs the fence behind it", () => {
    const fixed = rewriteProblem("Remove the black car completely instead of having the fence sit on top of its trunk.");
    expect(fixed.toLowerCase()).toContain("keep the black car");
    expect(fixed.toLowerCase()).toContain("behind");
    expect(fixed.toLowerCase()).not.toContain("remove");
  });

  it("leaves a real removal and guide-mark cleanup alone", () => {
    expect(rewriteProblem("Remove the old carpet.")).toBe("Remove the old carpet.");
    expect(rewriteProblem("Remove every colored guide mark; none may appear in the photo.")).toContain("guide mark");
  });
});

describe("normalizeOccluders", () => {
  it("keeps a car silhouette and drops a blob that covers the whole photo", () => {
    const out = normalizeOccluders([
      {
        label: " black car ",
        points: [
          { x: 0.6, y: 0.45 },
          { x: 0.92, y: 0.48 },
          { x: 0.9, y: 0.82 },
          { x: 0.62, y: 0.8 },
          { x: 0.58, y: 0.6 },
          { x: 1.2, y: -0.1 },
        ],
      },
      {
        label: "everything",
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.label).toBe("black car");
    expect(out[0]!.points.every((p) => p.x <= 1 && p.y >= 0)).toBe(true);
  });
});

describe("judge", () => {
  const good = { kept: [{ label: "Window", ok: true }], changeDone: true, marksVisible: false, itemsFollowMarks: true, grounded: true, passesBehind: true, heightOk: true, realistic: true, problems: [] };

  it("passes a clean edit", () => {
    expect(judge(good, ["Window"])).toEqual({ pass: true, problems: [] });
  });

  it("fails when a kept feature disappears and explains how to fix it", () => {
    const r = judge({ ...good, kept: [{ label: "Window", ok: false }] }, ["Window"]);
    expect(r.pass).toBe(false);
    expect(r.problems[0]).toMatch(/window/i);
  });

  it("fails when guide marks are left in the photo", () => {
    const r = judge({ ...good, marksVisible: true }, ["Window"]);
    expect(r.pass).toBe(false);
    expect(r.problems.join(" ")).toMatch(/mark/i);
  });

  it("ignores features the user did not ask to keep", () => {
    expect(judge({ ...good, kept: [{ label: "Tub", ok: false }] }, ["Window"]).pass).toBe(true);
  });

  it("fails a fence that sits on the car or is the wrong height, and does not say to delete the car", () => {
    const r = judge(
      {
        ...good,
        grounded: false,
        passesBehind: false,
        heightOk: false,
        problems: ["Place the base of the new fence further forward to match the red guide line.", "Remove the black car completely instead of having the fence sit on top of its trunk."],
      },
      ["Window"],
      true,
    );
    expect(r.pass).toBe(false);
    const text = r.problems.join(" ");
    expect(text.toLowerCase()).toContain("keep the black car");
    expect(text.toLowerCase()).toContain("behind");
    expect(text.toLowerCase()).not.toMatch(/remove the black car/);
    expect(text.toLowerCase()).toContain("height");
  });
});
