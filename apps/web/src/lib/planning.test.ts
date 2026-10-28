import { describe, expect, it } from "vitest";
import { designQuantity } from "@architech/core";
import { initialPlanning } from "./planning";
import type { CProject, CVersion } from "./types";

describe("quick preview to editable planning", () => {
  it("preserves requested fence length without making the fence that thick", () => {
    const version = { number: 1, request: { message: "A twenty foot fence", drawings: [{ id: "f", itemType: "fence", kind: "line", points: [{ x: 0.2, y: 0.7 }, { x: 0.8, y: 0.7 }], dims: { lengthM: 6.096, heightM: 1.8288 }, options: {}, note: "Cedar" }] } } as CVersion;
    const project = { calibration: null, planning: null } as unknown as CProject;
    const plan = initialPlanning(project, version);
    const fence = plan.alternatives[0]!.items[0]!;
    expect(designQuantity(fence, "imperial").amount).toBeCloseTo(20);
    expect(fence.width).toBe(0.15);
    expect(fence.height).toBe(1.8288);
    expect(plan.alternatives[0]!.photoAligned).toBe(false);
  });
});
