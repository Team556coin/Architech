import { describe, expect, it } from "vitest";
import { spaceTitle, versionLabel } from "./labels";
import type { Drawing } from "./schemas";

const d = (itemType: string, note = ""): Drawing => ({
  id: itemType,
  number: 1,
  itemType,
  kind: "line",
  shape: "polyline",
  points: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ],
  zoneHeight: 0,
  options: {},
  note,
  dims: {},
});

describe("versionLabel", () => {
  it("names versions after the drawn items", () => {
    expect(versionLabel({ message: "", drawings: [d("fence")] })).toBe("Fence");
    expect(versionLabel({ message: "", drawings: [d("pool"), d("deck"), d("fire-pit")] })).toBe("Pool + deck +1");
    expect(versionLabel({ message: "", drawings: [d("fence"), d("fence")] })).toBe("Fence");
    expect(versionLabel({ message: "", drawings: [d("other", "Chicken coop")] })).toBe("Chicken coop");
  });

  it("uses a tidy version of the message otherwise", () => {
    expect(versionLabel({ message: "paint the walls sage green.", drawings: [] })).toBe("Paint the walls sage green");
    const long = versionLabel({ message: "replace the old carpet with light oak hardwood floors everywhere", drawings: [] });
    expect(long.length).toBeLessThanOrEqual(28);
    expect(long.endsWith("…")).toBe(true);
    expect(versionLabel({ message: "  ", drawings: [] })).toBe("Edit");
  });

  it("formats space titles", () => {
    expect(spaceTitle("living-room")).toBe("Living room");
  });
});
