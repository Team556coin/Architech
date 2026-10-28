import type { Calibration } from "@architech/core";
import { describe, expect, it } from "vitest";
import { buildGroundModel, impliedCameraHeight, referenceProblem } from "./ground";
import { camera as c, ground, project } from "./testCamera";

const base = {
  imageWidth: c.width,
  imageHeight: c.height,
  focalPx: c.focal,
  horizonY: c.horizonY / c.height,
  horizonSource: "estimated" as const,
  references: [],
  units: "imperial" as const,
};

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe("buildGroundModel", () => {
  it("returns null when there is nothing to scale from", () => {
    expect(buildGroundModel({ ...base } as Calibration)).toBeNull();
  });

  it("recovers real distances from one ground reference using the horizon model", () => {
    const cal: Calibration = {
      ...base,
      references: [{ id: "r", kind: "ground", a: ground(c, -1, 5), b: ground(c, 2, 5), lengthM: 3, source: "user" }],
    };
    const m = buildGroundModel(cal)!;
    expect(m.kind).toBe("horizon");
    const p = m.toGround(ground(c, 0, 8))!;
    const q = m.toGround(ground(c, 4, 12))!;
    expect(dist(p, q)).toBeCloseTo(Math.hypot(4, 4), 2);
  });

  it("recovers the camera height from a vertical reference such as a door", () => {
    const cal: Calibration = {
      ...base,
      references: [{ id: "door", kind: "vertical", a: project(c, 1, 0, 4), b: project(c, 1, 2.032, 4), lengthM: 2.032, source: "user" }],
    };
    const m = buildGroundModel(cal)!;
    const p = m.toGround(ground(c, -2, 6))!;
    const q = m.toGround(ground(c, 2, 6))!;
    expect(dist(p, q)).toBeCloseTo(4, 2);
  });

  it("measures heights of things standing on the ground", () => {
    const cal: Calibration = {
      ...base,
      references: [{ id: "r", kind: "ground", a: ground(c, -1, 5), b: ground(c, 2, 5), lengthM: 3, source: "user" }],
    };
    const m = buildGroundModel(cal)!;
    expect(m.heightAt(project(c, 0.5, 0, 7), project(c, 0.5, 1.83, 7))).toBeCloseTo(1.83, 2);
    const px = m.pixelsForHeight(project(c, 0.5, 0, 7), 1.83)!;
    const expected = (project(c, 0.5, 0, 7).y - project(c, 0.5, 1.83, 7).y) * c.height;
    expect(px).toBeCloseTo(expected, 1);
  });

  it("prefers user references over estimated ones", () => {
    const cal: Calibration = {
      ...base,
      references: [
        { id: "u", kind: "ground", a: ground(c, -1, 5), b: ground(c, 2, 5), lengthM: 3, source: "user" },
        { id: "e", kind: "ground", a: ground(c, -1, 5), b: ground(c, 2, 5), lengthM: 9, source: "estimated" },
      ],
    };
    const m = buildGroundModel(cal)!;
    expect(m.exact).toBe(false); // horizon was estimated
    expect(m.fromUser).toBe(true);
    expect(dist(m.toGround(ground(c, -1, 5))!, m.toGround(ground(c, 2, 5))!)).toBeCloseTo(3, 3);
  });

  it("uses an exact floor rectangle when given", () => {
    const cal: Calibration = {
      ...base,
      horizonY: undefined,
      floorRect: {
        corners: [ground(c, -1.4, 6), ground(c, 1.4, 6), ground(c, 1.4, 3.7), ground(c, -1.4, 3.7)],
        widthM: 2.8,
        depthM: 2.3,
      },
    };
    const m = buildGroundModel(cal)!;
    expect(m.kind).toBe("homography");
    expect(m.exact).toBe(true);
    expect(dist(m.toGround(ground(c, -1, 5))!, m.toGround(ground(c, 1, 4))!)).toBeCloseTo(Math.hypot(2, 1), 3);
    expect(m.heightAt(project(c, 0, 0, 5), project(c, 0, 2, 5))).toBeCloseTo(2, 1);
  });

  it("round-trips ground and image coordinates", () => {
    const cal: Calibration = {
      ...base,
      references: [{ id: "r", kind: "ground", a: ground(c, -1, 5), b: ground(c, 2, 5), lengthM: 3, source: "user" }],
    };
    const m = buildGroundModel(cal)!;
    const img = ground(c, 1.2, 9);
    const back = m.toImage(m.toGround(img)!)!;
    expect(back.x).toBeCloseTo(img.x, 6);
    expect(back.y).toBeCloseTo(img.y, 6);
  });

  it("refuses points above the horizon", () => {
    const cal: Calibration = {
      ...base,
      references: [{ id: "r", kind: "ground", a: ground(c, -1, 5), b: ground(c, 2, 5), lengthM: 3, source: "user" }],
    };
    const m = buildGroundModel(cal)!;
    expect(m.toGround({ x: 0.5, y: 0.2 })).toBeNull();
  });

  it("falls back to a typical phone focal length when EXIF is missing", () => {
    const cal: Calibration = {
      ...base,
      focalPx: undefined,
      references: [{ id: "r", kind: "ground", a: ground(c, -1, 5), b: ground(c, 2, 5), lengthM: 3, source: "user" }],
    };
    const m = buildGroundModel(cal)!;
    // Lateral distances at the reference depth stay correct even with the wrong focal length.
    expect(dist(m.toGround(ground(c, -1, 5))!, m.toGround(ground(c, 0, 5))!)).toBeCloseTo(1, 2);
  });
});

describe("referenceProblem", () => {
  it("accepts a door that stands on the floor", () => {
    const door = { id: "d", kind: "vertical" as const, a: project(c, 1, 0, 4), b: project(c, 1, 2.032, 4), lengthM: 2.032, source: "user" as const };
    expect(impliedCameraHeight(base as Calibration, door)).toBeCloseTo(1.6, 3);
    expect(referenceProblem(base as Calibration, door)).toBeNull();
  });

  it("flags a window high on the wall, since its bottom isn't on the floor", () => {
    const win = { id: "w", kind: "vertical" as const, a: project(c, 0, 1.4, 4), b: project(c, 0, 2.4, 4), lengthM: 1, source: "user" as const };
    expect(referenceProblem(base as Calibration, win)).toBe("not_on_floor");
  });

  it("flags a standing line whose bottom is above the horizon", () => {
    const shelf = { id: "s", kind: "vertical" as const, a: project(c, 0, 1.7, 4), b: project(c, 0, 2.2, 4), lengthM: 0.5, source: "user" as const };
    expect(impliedCameraHeight(base as Calibration, shelf)).toBeNull();
    expect(referenceProblem(base as Calibration, shelf)).toBe("not_on_floor");
  });

  it("flags a floor length that can't be right for this photo", () => {
    const typo = { id: "t", kind: "ground" as const, a: ground(c, -1, 5), b: ground(c, 2, 5), lengthM: 0.05, source: "user" as const };
    expect(referenceProblem(base as Calibration, typo)).toBe("size_mismatch");
  });

  it("trusts any reference when an exact floor rectangle sets the scale", () => {
    const win = { id: "w", kind: "vertical" as const, a: project(c, 0, 1.4, 4), b: project(c, 0, 2.4, 4), lengthM: 1, source: "user" as const };
    const rect = { corners: [ground(c, -1, 6), ground(c, 1, 6), ground(c, 1, 4), ground(c, -1, 4)] as const, widthM: 2, depthM: 2 };
    expect(referenceProblem({ ...base, floorRect: { ...rect, corners: [...rect.corners] } } as Calibration, win)).toBeNull();
  });
});
