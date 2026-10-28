import { describe, expect, it } from "vitest";
import { CATALOG, describeItem, getItem, itemsForSpace } from "./catalog";
import { getLook, looksFor } from "./looks";

describe("catalog", () => {
  it("offers outdoor living projects with usable footprints and preserves a custom fallback", () => {
    const yard = itemsForSpace("backyard");
    for (const id of ["patio-cover", "gazebo", "outdoor-kitchen", "grill-area", "outdoor-seating", "outdoor-dining", "play-structure", "shed"]) {
      const item = yard.find((i) => i.id === id)!;
      expect(item.kind).toBe("area");
      expect(item.defaultSize?.widthM).toBeGreaterThan(0);
      expect(item.defaultHeightM).toBeGreaterThan(0);
      expect(itemsForSpace("kitchen").map((i) => i.id)).not.toContain(id);
    }
    expect(getItem("lazy-river").kind).toBe("brush");
    expect(getItem("lazy-river").hint).toContain("unpainted");
    expect(itemsForSpace("kitchen").map((i) => i.id)).toContain("remove-area");
    expect(yard.at(-1)?.id).toBe("other");
  });

  it("has unique ids", () => {
    const ids = CATALOG.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every choice option default is one of its choices", () => {
    for (const item of CATALOG) {
      for (const opt of item.options) {
        if (opt.type === "choice") {
          expect(opt.choices.map((c) => c.id)).toContain(opt.default);
        }
      }
    }
  });

  it("shows outdoor items for a backyard and indoor items for a bathroom", () => {
    const yard = itemsForSpace("backyard").map((i) => i.id);
    expect(yard).toEqual(expect.arrayContaining(["fence", "pool", "deck", "fire-pit", "flower-bed", "pergola"]));
    expect(yard).not.toContain("walk-in-shower");
    const bath = itemsForSpace("bathroom").map((i) => i.id);
    expect(bath).toEqual(expect.arrayContaining(["walk-in-shower", "bathtub", "vanity"]));
    expect(bath).not.toContain("pool");
    expect(yard[yard.length - 1]).toBe("other");
  });

  it("keeps bathroom fixtures out of the kitchen and the island out of the bathroom", () => {
    const kitchen = itemsForSpace("kitchen").map((i) => i.id);
    expect(kitchen).toContain("kitchen-island");
    expect(kitchen).not.toContain("toilet");
    expect(kitchen).not.toContain("walk-in-shower");
    expect(itemsForSpace("bathroom").map((i) => i.id)).not.toContain("kitchen-island");
    expect(itemsForSpace("other").map((i) => i.id)).toEqual(expect.arrayContaining(["toilet", "kitchen-island", "fence"]));
  });

  it("fence is a tall line item with a height option", () => {
    const fence = getItem("fence");
    expect(fence.kind).toBe("line");
    expect(fence.tall).toBe(true);
    expect(fence.options.map((o) => o.id)).toEqual(["height"]);
  });

  it("describes an item from its options in plain words", () => {
    const text = describeItem("fence", { height: "6ft" }, "stained cedar");
    expect(text).toContain("6 ft");
    expect(text).toContain("stained cedar");
  });

  it("offers five fence board styles plus a way to match the photo", () => {
    const looks = looksFor("fence");
    expect(looks.map((l) => l.id)).toEqual(["dog-ear", "flat-top", "board-batten", "horizontal", "picket"]);
    expect(getLook("fence", "picket")?.prompt.toLowerCase()).toContain("picket");
    expect(looksFor("pool")).toEqual([]);
    for (const look of looks) expect(look.svg).toContain("<svg");
  });

  it("describes toggles that are on and skips toggles that are off", () => {
    const text = describeItem("walk-in-shower", { door: "frameless", tile: "large-stone", bench: true, niche: false, "rain-head": true });
    expect(text.toLowerCase()).toContain("bench");
    expect(text.toLowerCase()).not.toContain("niche");
    expect(text.toLowerCase()).toContain("rain");
  });

  it("falls back to 'other' for unknown ids", () => {
    expect(getItem("does-not-exist").id).toBe("other");
  });
});
