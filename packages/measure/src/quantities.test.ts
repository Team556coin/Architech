import { describe, expect, it } from "vitest";
import { quantitiesFor } from "./quantities";

const FT = 0.3048;
const IN = 0.0254;
const SQFT = FT * FT;

const find = (rows: { label: string; value: string }[], label: string) => rows.find((r) => r.label === label)?.value;

describe("quantitiesFor", () => {
  it("counts fence panels and posts per run", () => {
    const rows = quantitiesFor(
      "fence",
      { runsM: [38 * FT, 22 * FT], lengthM: 60 * FT, heightM: 6 * FT, heightExact: true, lengthExact: false },
      { height: "6ft" },
      "imperial",
      "Dog-ear",
    );
    expect(find(rows, "Total length")).toBe("≈ 60 ft");
    expect(find(rows, "Height")).toBe("6 ft");
    expect(find(rows, "Panels")).toBe("8 ft wide x 8");
    expect(find(rows, "Posts")).toBe("9");
    expect(find(rows, "Boards")).toBe("Dog-ear");
  });

  it("computes flower bed area, edging and mulch", () => {
    const rows = quantitiesFor(
      "flower-bed",
      { areaM2: 186 * SQFT, perimeterM: 82 * FT, lengthM: 18 * FT, widthM: 4 * FT, runsM: [], lengthExact: true, widthExact: true },
      {},
      "imperial",
    );
    expect(find(rows, "Area")).toBe("186 sq ft");
    expect(find(rows, "Edging")).toBe("≈ 82 ft");
    expect(find(rows, "Mulch (3 in deep)")).toBe("≈ 1.7 cu yd");
  });

  it("computes deck area and dimensions", () => {
    const rows = quantitiesFor(
      "deck",
      { areaM2: 192 * SQFT, perimeterM: 56 * FT, lengthM: 16 * FT, widthM: 12 * FT, runsM: [], lengthExact: true, widthExact: true },
      { material: "composite", steps: true },
      "imperial",
    );
    expect(find(rows, "Size")).toBe("16 ft x 12 ft");
    expect(find(rows, "Area")).toBe("192 sq ft");
  });

  it("estimates shower tile with walls and floor", () => {
    const rows = quantitiesFor(
      "walk-in-shower",
      { areaM2: 60 * 36 * IN * IN, perimeterM: 192 * IN, lengthM: 60 * IN, widthM: 36 * IN, heightM: 78 * IN, runsM: [], lengthExact: true, widthExact: true, heightExact: true },
      { tile: "large-stone", door: "frameless", bench: true },
      "imperial",
    );
    expect(find(rows, "Shower size")).toBe("60 in x 36 in");
    expect(find(rows, "Glass")).toBe("Frameless glass, 78 in tall");
    // floor 15 + back wall 32.5 + side wall 19.5 = 67 sq ft, plus 10% waste = 74
    expect(find(rows, "Tile (with 10% extra)")).toBe("≈ 74 sq ft");
  });

  it("gives pool water area and diameter for round items", () => {
    const pool = quantitiesFor(
      "pool",
      { areaM2: 330 * SQFT, perimeterM: 70 * FT, lengthM: 28 * FT, widthM: 14 * FT, runsM: [], lengthExact: true, widthExact: true },
      {},
      "imperial",
    );
    expect(find(pool, "Water area")).toBe("330 sq ft");
    const pit = quantitiesFor("fire-pit", { areaM2: 10.5, perimeterM: 11.5, diameterM: 12 * FT, runsM: [], lengthExact: false }, { style: "sunken" }, "imperial");
    expect(find(pit, "Across")).toBe("≈ 12 ft");
    expect(find(pit, "Seats about")).toBe("8");
  });
});
