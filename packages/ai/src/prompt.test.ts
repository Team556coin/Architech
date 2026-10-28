import type { Drawing } from "@architech/core";
import { describe, expect, it } from "vitest";
import { buildEditPrompt, describeDrawingForPrompt } from "./prompt";

const fence: Drawing = {
  id: "f",
  number: 1,
  itemType: "fence",
  kind: "line",
  shape: "polyline",
  points: [
    { x: 0.1, y: 0.6 },
    { x: 0.8, y: 0.6 },
  ],
  zoneHeight: 0.2,
  options: { height: "6ft" },
  look: { source: "preset", presetId: "dog-ear" },
  note: "stained dark",
  dims: {},
};

const pit: Drawing = {
  id: "p",
  number: 2,
  itemType: "fire-pit",
  kind: "area",
  shape: "ellipse",
  points: [
    { x: 0.5, y: 0.7 },
    { x: 0.6, y: 0.7 },
    { x: 0.55, y: 0.8 },
  ],
  zoneHeight: 0,
  options: { style: "sunken", seating: "stone-bench" },
  note: "",
  dims: {},
};

describe("describeDrawingForPrompt", () => {
  it("names the color, the item and what the mark means", () => {
    const text = describeDrawingForPrompt(fence, { lengthM: 18.29, runsM: [11.58, 6.71], heightM: 1.83, lengthExact: false, heightExact: true }, "imperial");
    expect(text).toContain("coral red line");
    expect(text).toContain("6 ft tall");
    expect(text.toLowerCase()).toContain("dog-ear");
    expect(text.toLowerCase()).toContain("cedar");
    expect(text).toContain("stained dark");
    expect(text).toContain("base");
    expect(text).toContain("top edge");
    expect(text.toLowerCase()).toContain("behind");
    expect(text).toContain("38 ft");
  });

  it("describes area outlines as footprints", () => {
    const text = describeDrawingForPrompt(pit, { diameterM: 3.66, lengthM: 3.66, widthM: 3.66, runsM: [], lengthExact: false }, "imperial");
    expect(text).toContain("blue outline");
    expect(text).toContain("footprint");
    expect(text).toContain("sunken");
    expect(text).toContain("12 ft across");
  });
});

describe("buildEditPrompt", () => {
  const keep = [
    { id: "window", label: "Window", keep: true },
    { id: "door", label: "Door", keep: true },
    { id: "tub", label: "Tub location", keep: false },
  ];

  it("locks every kept feature and the camera", () => {
    const p = buildEditPrompt({ plan: "Remodel into a modern spa bathroom.", keep, drawings: [], measures: {}, units: "imperial", hasGuide: false });
    expect(p).toContain("Window");
    expect(p).toContain("Door");
    expect(p).not.toContain("Tub location");
    expect(p.toLowerCase()).toContain("camera angle");
    expect(p.toLowerCase()).toContain("photorealistic");
    expect(p).toContain("Remodel into a modern spa bathroom.");
  });

  it("tells the model to copy the fence already in the photo", () => {
    const text = describeDrawingForPrompt({ ...fence, look: { source: "existing" } }, undefined, "imperial");
    expect(text.toLowerCase()).toContain("already in the photo");
  });

  it("points at the attached board photo", () => {
    const text = describeDrawingForPrompt({ ...fence, look: { source: "photo", photoKey: "tmp/u/a.jpg" } }, undefined, "imperial", 3);
    expect(text).toContain("Image 3");
    expect(text.toLowerCase()).toContain("boards");
  });

  it("explains the guide image and forbids leftover marks when drawings exist", () => {
    const p = buildEditPrompt({ plan: "Add a fence and a fire pit.", keep, drawings: [fence, pit], measures: {}, units: "imperial", hasGuide: true });
    expect(p).toContain("second image");
    expect(p.toLowerCase()).toContain("do not draw");
    expect(p).toContain("#1");
    expect(p).toContain("#2");
    expect(p.toLowerCase()).toContain("only change");
    expect(p.toLowerCase()).toContain("behind");
    expect(p.toLowerCase()).toContain("does not sit on a car");
  });

  it("adds feedback from a failed check on retries", () => {
    const p = buildEditPrompt({ plan: "x", keep, drawings: [], measures: {}, units: "imperial", hasGuide: false, retryFeedback: ["The window was removed."] });
    expect(p).toContain("The window was removed.");
    expect(p.toLowerCase()).toContain("previous attempt");
  });
});
