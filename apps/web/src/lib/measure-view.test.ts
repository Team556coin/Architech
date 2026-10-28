import type { Calibration, Drawing } from "@architech/core";
import { describe, expect, it } from "vitest";
import { basisText, gettingFor, measuredSizeText, overlaysFor, scaleOf } from "./measure-view";

const cal = (source: "user" | "estimated"): Calibration => ({
  imageWidth: 1500,
  imageHeight: 1000,
  horizonY: 0.4,
  horizonSource: "estimated",
  references: [{ id: "r1", kind: "vertical", a: { x: 0.2, y: 0.9 }, b: { x: 0.2, y: 0.6 }, lengthM: 2.03, source, label: "back door" }],
  units: "imperial",
});

const fence: Drawing = {
  id: "f1",
  number: 1,
  itemType: "fence",
  kind: "line",
  shape: "polyline",
  points: [
    { x: 0.1, y: 0.8 },
    { x: 0.6, y: 0.8 },
    { x: 0.9, y: 0.95 },
  ],
  zoneHeight: 0.2,
  options: { height: "6ft", material: "wood", style: "privacy" },
  note: "",
  dims: {},
};

describe("measurement views", () => {
  it("knows whether the scale came from the homeowner", () => {
    expect(scaleOf(null).status).toBe("none");
    expect(scaleOf(cal("user")).status).toBe("user");
    expect(scaleOf(cal("estimated")).status).toBe("estimated");
  });

  it("doesn't call the scale accurate when a measurement can't be on the floor", () => {
    const window: Calibration = {
      ...cal("user"),
      references: [{ id: "w", kind: "vertical", a: { x: 0.5, y: 0.45 }, b: { x: 0.5, y: 0.2 }, lengthM: 1, source: "user", label: "window" }],
    };
    expect(scaleOf(window).status).toBe("suspect");
  });

  it("labels each fence run and its height", () => {
    const { model } = scaleOf(cal("user"));
    const [o] = overlaysFor([fence], model, "imperial");
    expect(o!.label).toBe("Fence");
    expect(o!.color).toBe("#F0503C");
    expect(o!.lines.filter((l) => l.kind === "run")).toHaveLength(2);
    const heights = o!.lines.filter((l) => l.kind === "height");
    expect(heights.length).toBeGreaterThanOrEqual(2);
    expect(heights.every((l) => l.text === "6 ft")).toBe(true);
    const span = (l: (typeof heights)[number]) => l.a.y - l.b.y;
    const near = heights.reduce((a, b) => (a.a.y > b.a.y ? a : b));
    const far = heights.reduce((a, b) => (a.a.y < b.a.y ? a : b));
    expect(span(near)).toBeGreaterThan(span(far));
    expect(o!.lines[0]!.text).toMatch(/^≈ \d+ ft/);
  });

  it("says when a fence height is real in the photo", () => {
    const { model } = scaleOf(cal("user"));
    expect(measuredSizeText(fence, model, "imperial")).toMatch(/^6 ft tall in this photo · ≈ \d+ ft along the ground$/);
    expect(measuredSizeText(fence, scaleOf(cal("estimated")).model, "imperial")).toMatch(/^≈ 6 ft tall on the photo's estimated scale/);
    expect(measuredSizeText(fence, null, "imperial")).toBe("Set the size of the photo to make this a true 6 ft fence in the picture.");
  });

  it("lists what you're getting with panels and posts", () => {
    const { model } = scaleOf(cal("user"));
    const [g] = gettingFor([fence], model, "imperial");
    expect(g!.rows.map((r) => r.label)).toEqual(expect.arrayContaining(["Total length", "Height", "Panels", "Posts", "Boards"]));
    expect(g!.rows.find((r) => r.label === "Boards")!.value).toBe("Match the fence in the photo");
  });

  it("explains what the sizes are based on", () => {
    expect(basisText(cal("user"), "imperial")).toBe("Based on your measurement: back door = 6 ft 8 in");
    expect(basisText(cal("estimated"), "imperial")).toMatch(/^Estimated from back door = ≈ 6 ft 8 in/);
    expect(gettingFor([fence], null, "imperial")).toEqual([]);
  });
});
