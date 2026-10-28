import { drawingSchema, type Calibration } from "@architech/core";
import { buildGroundModel } from "@architech/measure";
import { describe, expect, it } from "vitest";
import { appendPoint, canFinish, createDrawing, finalizeDrawings, movePoint, nextNumber, scaleAround, setOptions, shapeCenter, toFreeform, translate, addStroke, extendStroke } from "./drawing-tools";

const cal: Calibration = {
  imageWidth: 1500,
  imageHeight: 1000,
  horizonY: 0.4,
  horizonSource: "estimated",
  references: [{ id: "r", kind: "vertical", a: { x: 0.2, y: 0.9 }, b: { x: 0.2, y: 0.6 }, lengthM: 2.03, source: "user" }],
  units: "imperial",
};
const model = buildGroundModel(cal);

describe("drawing tools", () => {
  it("numbers drawings 1, 2, 3 and reuses nothing", () => {
    const a = createDrawing("fence", [], null, { x: 0.2, y: 0.8 });
    const b = createDrawing("pool", [a], null, { x: 0.5, y: 0.8 });
    expect(a.number).toBe(1);
    expect(b.number).toBe(2);
    expect(nextNumber([a, b])).toBe(3);
  });

  it("builds a fence by tapping points, then it is valid", () => {
    let d = createDrawing("fence", [], model, { x: 0.1, y: 0.8 });
    expect(d.kind).toBe("line");
    expect(canFinish(d)).toBe(false);
    d = appendPoint(d, { x: 0.6, y: 0.82 }, model);
    expect(canFinish(d)).toBe(true);
    expect(d.options.height).toBe("6ft");
    expect(d.zoneHeight).toBeGreaterThan(0.05);
    expect(drawingSchema.safeParse(d).success).toBe(true);
  });

  it("drops a ready-made pool shape where you tap", () => {
    const d = createDrawing("pool", [], model, { x: 0.5, y: 0.8 });
    expect(d.shape).toBe("rect");
    expect(d.points).toHaveLength(4);
    const c = shapeCenter(d);
    expect(c.x).toBeCloseTo(0.5, 1);
    expect(drawingSchema.safeParse(d).success).toBe(true);
    const round = createDrawing("fire-pit", [], model, { x: 0.5, y: 0.8 });
    expect(round.shape).toBe("ellipse");
    expect(round.points.length).toBeGreaterThan(8);
  });

  it("keeps shapes inside the photo when moving and resizing", () => {
    const d = createDrawing("deck", [], null, { x: 0.5, y: 0.8 });
    const moved = translate(d, 2, 2);
    expect(moved.points.every((p) => p.x <= 1 && p.y <= 1)).toBe(true);
    const corner = movePoint(d, 0, { x: -1, y: 0.3 });
    expect(corner.points[0]).toEqual({ x: 0, y: 0.3 });
    const big = scaleAround(d, shapeCenter(d), 2, 1);
    const w = (pts: { x: number }[]) => Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
    expect(w(big.points)).toBeCloseTo(Math.min(1, w(d.points) * 2), 2);
  });

  it("raises the edit zone when a taller fence is picked", () => {
    const d = appendPoint(createDrawing("fence", [], model, { x: 0.1, y: 0.8 }), { x: 0.6, y: 0.8 }, model);
    const taller = setOptions(d, { ...d.options, height: "8ft" }, model);
    expect(taller.zoneHeight).toBeGreaterThan(d.zoneHeight);
  });

  it("lets a picked height replace a dragged one", () => {
    const d = appendPoint(createDrawing("fence", [], model, { x: 0.1, y: 0.8 }), { x: 0.6, y: 0.8 }, model);
    const dragged = { ...d, dims: { heightM: 1.2 }, zoneHeight: 0.12 };
    const picked = setOptions(dragged, { ...dragged.options, height: "8ft" }, model);
    expect(picked.dims.heightM).toBeUndefined();
    expect(picked.zoneHeight).toBeGreaterThan(d.zoneHeight);
  });

  it("turns a rectangle pool into a freeform one with more corners", () => {
    const d = createDrawing("pool", [], null, { x: 0.5, y: 0.7 });
    const f = toFreeform(d);
    expect(f.shape).toBe("polygon");
    expect(f.points.length).toBeGreaterThanOrEqual(8);
  });

  it("paints and erases with the brush", () => {
    let d = createDrawing("change-area", [], null, { x: 0.3, y: 0.3 });
    expect(d.kind).toBe("brush");
    d = addStroke(d, { x: 0.3, y: 0.3 }, 0.05, false);
    d = extendStroke(d, { x: 0.4, y: 0.32 });
    d = addStroke(d, { x: 0.35, y: 0.3 }, 0.03, true);
    expect(d.strokes).toHaveLength(2);
    expect(d.strokes![0]!.points).toHaveLength(2);
    expect(d.strokes![1]!.erase).toBe(true);
  });

  it("drops unfinished drawings before sending", () => {
    const line = createDrawing("fence", [], null, { x: 0.1, y: 0.8 });
    const brush = createDrawing("change-area", [line], null, { x: 0.1, y: 0.8 });
    const ok = appendPoint(createDrawing("path", [line, brush], null, { x: 0.1, y: 0.9 }), { x: 0.5, y: 0.9 }, null);
    const out = finalizeDrawings([line, brush, ok]);
    expect(out.map((d) => d.itemType)).toEqual(["path"]);
    expect(out[0]!.number).toBe(1);
  });
});
