import { CATALOG } from "@architech/core";
import { describe, expect, it } from "vitest";
import { ITEM_ICONS } from "./icons";

describe("item icons", () => {
  it("has a real icon for every catalog item", () => {
    for (const item of CATALOG) expect(ITEM_ICONS[item.icon], item.id).toBeTruthy();
  });
});
