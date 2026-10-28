import { calibrationSchema, type Calibration } from "@architech/core";
import { buildGroundModel } from "@architech/measure";
import { describe, expect, it } from "vitest";
import { addMeasurement, confirmReference, guessKind, removeReference, setFloorRect, updateReference } from "./calibration";

const base: Calibration = {
  imageWidth: 1500,
  imageHeight: 1000,
  horizonY: 0.4,
  horizonSource: "estimated",
  references: [{ id: "est-1", kind: "vertical", a: { x: 0.8, y: 0.9 }, b: { x: 0.8, y: 0.62 }, lengthM: 2.03, source: "estimated", label: "door" }],
  units: "imperial",
};

describe("calibration", () => {
  it("guesses whether a measured line stands up or lies on the floor", () => {
    expect(guessKind({ x: 0.2, y: 0.9 }, { x: 0.21, y: 0.5 }, 1.5)).toBe("vertical");
    expect(guessKind({ x: 0.2, y: 0.9 }, { x: 0.7, y: 0.85 }, 1.5)).toBe("ground");
  });

  it("adds a measurement with the bottom end first for heights", () => {
    const next = addMeasurement(base, { x: 0.2, y: 0.5 }, { x: 0.2, y: 0.9 }, 2.03, "vertical", "back door");
    const r = next.references.at(-1)!;
    expect(r.source).toBe("user");
    expect(r.a.y).toBeGreaterThan(r.b.y);
    expect(calibrationSchema.safeParse(next).success).toBe(true);
    expect(buildGroundModel(next)!.fromUser).toBe(true);
  });

  it("confirms, fixes and removes estimates", () => {
    expect(confirmReference(base, "est-1").references[0]!.source).toBe("user");
    const fixed = updateReference(base, "est-1", 2.13);
    expect(fixed.references[0]).toMatchObject({ lengthM: 2.13, source: "user" });
    expect(removeReference(base, "est-1").references).toHaveLength(0);
  });

  it("uses the floor corners and room size for an exact floor plan", () => {
    const next = setFloorRect(
      base,
      [
        { x: 0.3, y: 0.55 },
        { x: 0.7, y: 0.55 },
        { x: 0.9, y: 0.95 },
        { x: 0.1, y: 0.95 },
      ],
      2.8,
      2.3,
    );
    const model = buildGroundModel(next)!;
    expect(model.kind).toBe("homography");
    expect(next.roomSize).toMatchObject({ lengthM: 2.8, widthM: 2.3 });
  });
});
