import { describe, expect, it, vi } from "vitest";

vi.mock("./native", () => ({ isNative: () => false, shareNativeImage: vi.fn() }));

const { fileNameFor } = await import("./export");

describe("fileNameFor", () => {
  it("makes a tidy file name from the project and version", () => {
    expect(fileNameFor("Main Bathroom", "Version 2")).toBe("main-bathroom-version-2.jpg");
  });

  it("marks the copy with dimension lines so it doesn't replace the clean photo", () => {
    expect(fileNameFor("Main Bathroom", "Version 2", { measured: true })).toBe("main-bathroom-version-2-measurements.jpg");
  });

  it("falls back to a name when the title has no letters", () => {
    expect(fileNameFor("!!!", "")).toBe("home-redo.jpg");
    expect(fileNameFor("!!!", "", { measured: true })).toBe("home-redo-measurements.jpg");
  });
});
