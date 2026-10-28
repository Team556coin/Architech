import { describe, expect, it } from "vitest";
import { formatArea, formatLength, formatVolume, parseLength } from "./units";

const FT = 0.3048;
const IN = 0.0254;

describe("formatLength", () => {
  it("formats feet and inches", () => {
    expect(formatLength(9 * FT + 2 * IN, "imperial")).toBe("9 ft 2 in");
    expect(formatLength(6 * FT, "imperial")).toBe("6 ft");
    expect(formatLength(38 * FT + 0.2 * IN, "imperial")).toBe("38 ft");
  });

  it("rounds long lengths to whole feet", () => {
    expect(formatLength(37.8 * FT, "imperial")).toBe("38 ft");
  });

  it("uses inches for short lengths or fixtures", () => {
    expect(formatLength(18 * IN, "imperial")).toBe("18 in");
    expect(formatLength(60 * IN, "imperial", { preferInches: true })).toBe("60 in");
    expect(formatLength(78 * IN, "imperial", { preferInches: true })).toBe("78 in");
  });

  it("formats metric", () => {
    expect(formatLength(2.794, "metric")).toBe("2.79 m");
    expect(formatLength(0.45, "metric")).toBe("45 cm");
    expect(formatLength(11.58, "metric")).toBe("11.6 m");
  });

  it("adds an approx sign for estimates", () => {
    expect(formatLength(6 * FT, "imperial", { estimated: true })).toBe("≈ 6 ft");
  });
});

describe("formatArea and formatVolume", () => {
  it("formats square feet and square meters", () => {
    expect(formatArea(186 * FT * FT, "imperial")).toBe("186 sq ft");
    expect(formatArea(1600 * FT * FT, "imperial")).toBe("1,600 sq ft");
    expect(formatArea(17.28, "metric")).toBe("17.3 m²");
  });

  it("formats cubic yards and cubic meters", () => {
    expect(formatVolume(2.3 * 0.764555, "imperial")).toBe("2.3 cu yd");
    expect(formatVolume(1.75, "metric")).toBe("1.8 m³");
  });
});

describe("parseLength", () => {
  it.each([
    ["9 ft 2 in", 9 * FT + 2 * IN],
    ["9' 2\"", 9 * FT + 2 * IN],
    ["9'2", 9 * FT + 2 * IN],
    ["60in", 60 * IN],
    ["60 inches", 60 * IN],
    ["6", 6 * FT],
    ["6.5 ft", 6.5 * FT],
    ["2.5 m", 2.5],
    ["250cm", 2.5],
    ["2,5 m", 2.5],
  ])("parses %s", (text, meters) => {
    expect(parseLength(text, "imperial")).toBeCloseTo(meters, 6);
  });

  it("treats bare numbers as meters in metric", () => {
    expect(parseLength("3", "metric")).toBeCloseTo(3);
  });

  it("returns null for nonsense", () => {
    expect(parseLength("big", "imperial")).toBeNull();
    expect(parseLength("-3 ft", "imperial")).toBeNull();
    expect(parseLength("", "imperial")).toBeNull();
  });
});
