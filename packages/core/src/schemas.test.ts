import { describe, expect, it } from "vitest";
import { calibrationSchema, drawingSchema, editRequestSchema } from "./schemas";

const fence = {
  id: "d1",
  number: 1,
  itemType: "fence",
  kind: "line",
  shape: "polyline",
  points: [
    { x: 0.1, y: 0.6 },
    { x: 0.8, y: 0.6 },
    { x: 0.95, y: 0.9 },
  ],
  zoneHeight: 0.15,
  options: { height: "6ft", material: "wood", style: "privacy" },
};

describe("drawingSchema", () => {
  it("accepts a fence polyline", () => {
    const parsed = drawingSchema.parse(fence);
    expect(parsed.points).toHaveLength(3);
    expect(parsed.note).toBe("");
  });

  it("rejects points outside the photo", () => {
    const bad = { ...fence, points: [{ x: 1.4, y: 0.2 }, { x: 0.3, y: 0.3 }] };
    expect(drawingSchema.safeParse(bad).success).toBe(false);
  });

  it("requires at least 2 points for a line and 3 for an area", () => {
    expect(drawingSchema.safeParse({ ...fence, points: [{ x: 0.1, y: 0.1 }] }).success).toBe(false);
    const pool = {
      ...fence,
      itemType: "pool",
      kind: "area",
      shape: "polygon",
      points: [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.1 },
      ],
    };
    expect(drawingSchema.safeParse(pool).success).toBe(false);
  });

  it("requires strokes for a brush drawing", () => {
    const brush = { ...fence, itemType: "change-area", kind: "brush", shape: "stroke", points: [] };
    expect(drawingSchema.safeParse(brush).success).toBe(false);
    const ok = { ...brush, strokes: [{ points: [{ x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 }], size: 0.03, erase: false }] };
    expect(drawingSchema.safeParse(ok).success).toBe(true);
  });
});

describe("calibrationSchema", () => {
  it("accepts references and a floor rectangle", () => {
    const c = calibrationSchema.parse({
      imageWidth: 1536,
      imageHeight: 1024,
      references: [
        { id: "r1", kind: "vertical", a: { x: 0.1, y: 0.9 }, b: { x: 0.1, y: 0.3 }, lengthM: 2.032, source: "user", label: "Door" },
      ],
      floorRect: {
        corners: [
          { x: 0.1, y: 0.7 },
          { x: 0.9, y: 0.7 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
        widthM: 2.79,
        depthM: 2.28,
      },
      units: "imperial",
    });
    expect(c.references[0]?.source).toBe("user");
  });
});

describe("editRequestSchema", () => {
  it("defaults keep and drawings to empty lists", () => {
    const r = editRequestSchema.parse({ message: "make it modern" });
    expect(r.drawings).toEqual([]);
    expect(r.keep).toEqual([]);
  });

  it("rejects an empty request with no drawings", () => {
    expect(editRequestSchema.safeParse({ message: "  " }).success).toBe(false);
  });
});
