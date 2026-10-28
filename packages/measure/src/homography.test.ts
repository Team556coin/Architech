import { describe, expect, it } from "vitest";
import { applyHomography, computeHomography, invert3 } from "./homography";

describe("homography", () => {
  const src = [
    { x: 100, y: 400 },
    { x: 900, y: 420 },
    { x: 1200, y: 950 },
    { x: -50, y: 900 },
  ];
  const dst = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 3 },
    { x: 0, y: 3 },
  ];

  it("maps the four correspondences exactly", () => {
    const H = computeHomography(src, dst);
    src.forEach((p, i) => {
      const q = applyHomography(H, p);
      expect(q.x).toBeCloseTo(dst[i]!.x, 6);
      expect(q.y).toBeCloseTo(dst[i]!.y, 6);
    });
  });

  it("round-trips through the inverse", () => {
    const H = computeHomography(src, dst);
    const Hi = invert3(H);
    const p = { x: 500, y: 700 };
    const back = applyHomography(Hi, applyHomography(H, p));
    expect(back.x).toBeCloseTo(p.x, 6);
    expect(back.y).toBeCloseTo(p.y, 6);
  });

  it("throws for degenerate input", () => {
    const line = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ];
    expect(() => computeHomography(line, dst)).toThrow();
  });
});
