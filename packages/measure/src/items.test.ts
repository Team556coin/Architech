import type { Calibration, Drawing } from "@architech/core";
import { describe, expect, it } from "vitest";
import { buildGroundModel } from "./ground";
import { dimensionLines, measureDrawing, presetShape, resizeDrawing, standingTops, zoneHeightFor } from "./items";
import { camera as c, ground, project } from "./testCamera";

const FT = 0.3048;

const cal: Calibration = {
  imageWidth: c.width,
  imageHeight: c.height,
  focalPx: c.focal,
  horizonY: c.horizonY / c.height,
  horizonSource: "user",
  references: [{ id: "r", kind: "ground", a: ground(c, -1, 5), b: ground(c, 2, 5), lengthM: 3, source: "user" }],
  units: "imperial",
};
const model = buildGroundModel(cal)!;

const baseDrawing = {
  id: "d",
  number: 1,
  zoneHeight: 0,
  options: {},
  note: "",
  dims: {},
};

describe("measureDrawing", () => {
  it("measures a two-run fence and its height", () => {
    const fence: Drawing = {
      ...baseDrawing,
      itemType: "fence",
      kind: "line",
      shape: "polyline",
      points: [ground(c, -6, 14), ground(c, 5.58, 14), ground(c, 5.58, 7.29)],
      options: { height: "6ft" },
    };
    const m = measureDrawing(fence, model)!;
    expect(m.runsM).toHaveLength(2);
    expect(m.runsM[0]).toBeCloseTo(11.58, 2);
    expect(m.runsM[1]).toBeCloseTo(6.71, 2);
    expect(m.lengthM).toBeCloseTo(18.29, 2);
    expect(m.heightM).toBeCloseTo(6 * FT, 6);
    expect(m.heightExact).toBe(true);
  });

  it("measures a rectangular pool", () => {
    const pool: Drawing = {
      ...baseDrawing,
      itemType: "pool",
      kind: "area",
      shape: "rect",
      points: [ground(c, -4, 14), ground(c, 4.53, 14), ground(c, 4.53, 9.73), ground(c, -4, 9.73)],
    };
    const m = measureDrawing(pool, model)!;
    expect(m.lengthM).toBeCloseTo(8.53, 2);
    expect(m.widthM).toBeCloseTo(4.27, 2);
    expect(m.areaM2).toBeCloseTo(8.53 * 4.27, 1);
    expect(m.perimeterM).toBeCloseTo(2 * (8.53 + 4.27), 1);
  });

  it("reports the diameter of an ellipse drawing", () => {
    const pts = Array.from({ length: 32 }, (_, i) => {
      const t = (i / 32) * Math.PI * 2;
      return ground(c, 3 + 1.83 * Math.cos(t), 10 + 1.83 * Math.sin(t));
    });
    const pit: Drawing = { ...baseDrawing, itemType: "fire-pit", kind: "area", shape: "ellipse", points: pts };
    const m = measureDrawing(pit, model)!;
    expect(m.diameterM).toBeCloseTo(3.66, 1);
  });

  it("uses typed dimensions as exact values", () => {
    const pool: Drawing = {
      ...baseDrawing,
      itemType: "pool",
      kind: "area",
      shape: "rect",
      points: [ground(c, -4, 14), ground(c, 4.53, 14), ground(c, 4.53, 9.73), ground(c, -4, 9.73)],
      dims: { lengthM: 8.5, widthM: 4.25 },
    };
    const m = measureDrawing(pool, model)!;
    expect(m.lengthM).toBe(8.5);
    expect(m.widthM).toBe(4.25);
    expect(m.lengthExact).toBe(true);
  });

  it("returns null without a ground model", () => {
    const fence: Drawing = { ...baseDrawing, itemType: "fence", kind: "line", shape: "polyline", points: [ground(c, -6, 14), ground(c, 5, 14)] };
    expect(measureDrawing(fence, null)).toBeNull();
  });
});

describe("resizeDrawing", () => {
  it("resizes an area drawing to typed length and width", () => {
    const deck: Drawing = {
      ...baseDrawing,
      itemType: "deck",
      kind: "area",
      shape: "rect",
      points: [ground(c, -3, 9), ground(c, 0, 9), ground(c, 0, 7), ground(c, -3, 7)],
    };
    const resized = resizeDrawing(deck, model, { lengthM: 16 * FT, widthM: 12 * FT })!;
    const m = measureDrawing({ ...resized, dims: {} }, model)!;
    expect(m.lengthM).toBeCloseTo(16 * FT, 2);
    expect(m.widthM).toBeCloseTo(12 * FT, 2);
    expect(resized.dims.lengthM).toBeCloseTo(16 * FT, 6);
  });

  it("scales a polyline to a typed total length from its first point", () => {
    const path: Drawing = { ...baseDrawing, itemType: "path", kind: "line", shape: "polyline", points: [ground(c, -2, 8), ground(c, 2, 8)] };
    const resized = resizeDrawing(path, model, { lengthM: 2 })!;
    const m = measureDrawing({ ...resized, dims: {} }, model)!;
    expect(m.lengthM).toBeCloseTo(2, 3);
    expect(resized.points[0]!.x).toBeCloseTo(path.points[0]!.x, 6);
  });
});

describe("presetShape", () => {
  it("drops a ready-made rectangle of the default size centred on a point", () => {
    const pts = presetShape("walk-in-shower", ground(c, 0, 6), model, "rect")!;
    const d: Drawing = { ...baseDrawing, itemType: "walk-in-shower", kind: "area", shape: "rect", points: pts };
    const m = measureDrawing(d, model)!;
    expect(m.lengthM).toBeCloseTo(60 * 0.0254, 2);
    expect(m.widthM).toBeCloseTo(36 * 0.0254, 2);
  });

  it("returns a fallback shape in image space without a model", () => {
    const pts = presetShape("pool", { x: 0.5, y: 0.7 }, null, "ellipse")!;
    expect(pts.length).toBeGreaterThan(8);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
    }
  });
});

describe("zoneHeightFor", () => {
  it("converts an item's real height into a zone height above its base", () => {
    const base = project(c, 0, 0, 10);
    const h = zoneHeightFor([base], 6 * FT, model)!;
    const expected = base.y - project(c, 0, 6 * FT, 10).y;
    expect(h).toBeCloseTo(expected, 3);
  });
});

describe("standingTops", () => {
  const fence = (points: Drawing["points"], zoneHeight = 0.2): Drawing => ({
    ...baseDrawing,
    itemType: "fence",
    kind: "line",
    shape: "polyline",
    points,
    zoneHeight,
    options: { height: "6ft" },
  });

  it("makes a near post taller on screen than a far post, at a true 6 ft", () => {
    const near = ground(c, 0, 6);
    const far = ground(c, 0, 16);
    const tops = standingTops(fence([near, far]), model)!;
    const nearLift = near.y - tops[0]!;
    const farLift = far.y - tops[1]!;
    expect(nearLift).toBeGreaterThan(farLift * 1.5);
    expect(nearLift).toBeCloseTo(near.y - project(c, 0, 6 * FT, 6).y, 2);
  });

  it("marks a true 6 ft at each end, taller on screen at the near post", () => {
    const near = ground(c, -2, 6);
    const far = ground(c, 4, 16);
    const fence: Drawing = {
      ...baseDrawing,
      itemType: "fence",
      kind: "line",
      shape: "polyline",
      points: [near, far],
      zoneHeight: 0.2,
      options: { height: "6ft" },
    };
    const lines = dimensionLines(fence, measureDrawing(fence, model), model).filter((l) => l.kind === "height");
    expect(lines).toHaveLength(2);
    const span = (y: number) => {
      const line = lines.find((l) => Math.abs(l.a.y - y) < 0.02)!;
      return line.a.y - line.b.y;
    };
    expect(span(near.y)).toBeGreaterThan(span(far.y) * 1.5);
    expect(span(near.y)).toBeCloseTo(near.y - project(c, 0, 6 * FT, 6).y, 2);
    expect(lines.every((l) => l.valueM)).toBe(true);
    expect(lines[0]!.valueM).toBeCloseTo(6 * FT, 5);
  });

  it("uses the drawn zone height when the photo has no scale", () => {
    const tops = standingTops(fence([{ x: 0.2, y: 0.8 }, { x: 0.8, y: 0.7 }], 0.25), null)!;
    expect(tops[0]).toBeCloseTo(0.55, 5);
    expect(tops[1]).toBeCloseTo(0.45, 5);
  });
});
