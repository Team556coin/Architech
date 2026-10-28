import { describe, expect, it } from "vitest";
import {
  convexHull,
  minAreaRect,
  pointInPolygon,
  polygonArea,
  polygonDistance,
  polygonPerimeter,
  polylineLength,
  segmentDistance,
} from "./geometry";

const square = [
  { x: 0, y: 0 },
  { x: 2, y: 0 },
  { x: 2, y: 2 },
  { x: 0, y: 2 },
];

describe("geometry", () => {
  it("computes polygon area regardless of winding", () => {
    expect(polygonArea(square)).toBeCloseTo(4);
    expect(polygonArea([...square].reverse())).toBeCloseTo(4);
  });

  it("computes perimeter and polyline length", () => {
    expect(polygonPerimeter(square)).toBeCloseTo(8);
    expect(polylineLength(square)).toBeCloseTo(6);
  });

  it("finds the convex hull", () => {
    const pts = [...square, { x: 1, y: 1 }, { x: 0.5, y: 0.2 }];
    expect(convexHull(pts)).toHaveLength(4);
  });

  it("measures a rotated rectangle with minAreaRect", () => {
    const a = Math.PI / 6;
    const rot = (x: number, y: number) => ({ x: x * Math.cos(a) - y * Math.sin(a) + 5, y: x * Math.sin(a) + y * Math.cos(a) - 3 });
    const rect = [rot(0, 0), rot(6, 0), rot(6, 2), rot(0, 2)];
    const r = minAreaRect(rect);
    expect(r.length).toBeCloseTo(6);
    expect(r.width).toBeCloseTo(2);
    expect(Math.abs(Math.cos(r.angle))).toBeCloseTo(Math.abs(Math.cos(a)));
  });

  it("computes segment and polygon distances", () => {
    expect(segmentDistance({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 3 }, { x: 2, y: 3 })).toBeCloseTo(3);
    const other = square.map((p) => ({ x: p.x + 5, y: p.y }));
    expect(polygonDistance(square, other)).toBeCloseTo(3);
    const overlapping = square.map((p) => ({ x: p.x + 1, y: p.y }));
    expect(polygonDistance(square, overlapping)).toBe(0);
  });

  it("tests point in polygon", () => {
    expect(pointInPolygon({ x: 1, y: 1 }, square)).toBe(true);
    expect(pointInPolygon({ x: 3, y: 1 }, square)).toBe(false);
  });
});
