import { describe, expect, it } from "vitest";
import { designAlternativeSchema, designItemSchema, designChecks, designQuantity, newDesignItem, planningSchema, smoothRoute, worldPoints } from "./design";

describe("persistent design model", () => {
  it("computes surface quantities and waste in the selected pricing units", () => {
    const item = { ...newDesignItem("patio", "p"), width: 3.048, depth: 3.048, waste: 10, unitCost: 5, laborCost: 200 };
    const q = designQuantity(item, "imperial");
    expect(q.amount).toBeCloseTo(100);
    expect(q.purchase).toBeCloseTo(110);
    expect(q.cost).toBeCloseTo(750);
    expect(designQuantity({ ...item, unitCost: null }, "imperial").cost).toBeNull();
  });
  it("prices a loop as channel length times width, rather than filling its island", () => {
    const item = { ...newDesignItem("lazy-river", "river"), curved: false, width: 1, height: 1, points: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }] };
    expect(designQuantity(item, "metric").area).toBe(40);
    expect(designQuantity(item, "metric").volume).toBe(40);
    const rounded = smoothRoute(item.points, true);
    expect(rounded.length).toBeGreaterThan(4);
    expect(rounded.every((p) => p.x >= 0 && p.x <= 10 && p.z >= 0 && p.z <= 10)).toBe(true);
  });
  it("rotates the actual footprint and includes clearance in boundary checks", () => {
    const item = { ...newDesignItem("outdoor-kitchen", "k"), width: 4, depth: 2, x: 3, z: 3, rotation: 90, clearance: 2 };
    const points = worldPoints(item);
    expect(points[0]!.x).toBeCloseTo(4);
    expect(points[0]!.z).toBeCloseTo(1);
    expect(designChecks(designAlternativeSchema.parse({ id: "a", name: "A", width: 6, depth: 6, items: [item] })).join(" ")).toContain("beyond");
  });
  it("rejects duplicate object IDs, missing alternatives and invalid geometry", () => {
    const item = newDesignItem("gazebo", "g");
    expect(designAlternativeSchema.safeParse({ id: "a", name: "A", items: [item, item] }).success).toBe(false);
    expect(designItemSchema.safeParse({ ...item, width: -1 }).success).toBe(false);
    expect(designItemSchema.safeParse({ ...item, shape: "path", points: [] }).success).toBe(false);
    expect(planningSchema.safeParse({ revision: 0, activeId: "missing", alternatives: [{ id: "a", name: "A" }] }).success).toBe(false);
  });
});
