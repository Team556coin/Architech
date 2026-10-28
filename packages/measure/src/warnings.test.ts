import type { Calibration, Drawing } from "@architech/core";
import { describe, expect, it } from "vitest";
import { buildGroundModel } from "./ground";
import { fitWarnings } from "./warnings";
import { camera as c, ground } from "./testCamera";

const room: Calibration = {
  imageWidth: c.width,
  imageHeight: c.height,
  focalPx: c.focal,
  floorRect: {
    corners: [ground(c, -1.4, 6), ground(c, 1.4, 6), ground(c, 1.4, 3.7), ground(c, -1.4, 3.7)],
    widthM: 2.8,
    depthM: 2.3,
  },
  references: [],
  units: "imperial",
};
const model = buildGroundModel(room)!;
const d = (id: string, itemType: string, pts: { x: number; y: number }[]): Drawing => ({
  id,
  number: 1,
  itemType,
  kind: "area",
  shape: "rect",
  points: pts,
  zoneHeight: 0,
  options: {},
  note: "",
  dims: {},
});

describe("fitWarnings", () => {
  it("warns when an item is bigger than the room", () => {
    const huge = d("a", "walk-in-shower", [ground(c, -2, 6), ground(c, 2, 6), ground(c, 2, 4), ground(c, -2, 4)]);
    const w = fitWarnings([huge], model, room);
    expect(w.some((x) => x.message.includes("bigger than your room"))).toBe(true);
  });

  it("warns about tight walkways between items indoors", () => {
    const shower = d("a", "walk-in-shower", [ground(c, 0, 6), ground(c, 1.4, 6), ground(c, 1.4, 5.1), ground(c, 0, 5.1)]);
    const tub = d("b", "bathtub", [ground(c, 0, 4.7), ground(c, 1.4, 4.7), ground(c, 1.4, 3.9), ground(c, 0, 3.9)]);
    const w = fitWarnings([shower, tub], model, room);
    const tight = w.find((x) => x.kind === "clearance");
    expect(tight?.message).toMatch(/Only .* walkway between/);
  });

  it("reports the distance between outdoor items as info", () => {
    const yard: Calibration = { ...room, floorRect: undefined, horizonY: c.horizonY / c.height, references: [{ id: "r", kind: "ground", a: ground(c, -1, 5), b: ground(c, 2, 5), lengthM: 3, source: "user" }] };
    const m = buildGroundModel(yard)!;
    const pool = d("a", "pool", [ground(c, -4, 14), ground(c, 0, 14), ground(c, 0, 10), ground(c, -4, 10)]);
    const pit = d("b", "fire-pit", [ground(c, 1.83, 14), ground(c, 4, 14), ground(c, 4, 12), ground(c, 1.83, 12)]);
    const w = fitWarnings([pool, pit], m, yard);
    expect(w.find((x) => x.kind === "distance")?.message).toBe("≈ 6 ft between Pool and Fire pit");
  });

  it("returns nothing without a model", () => {
    expect(fitWarnings([], null, room)).toEqual([]);
  });
});
