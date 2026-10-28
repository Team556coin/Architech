import { describe, expect, it } from "vitest";
import { newDesignItem } from "@architech/core";
import { decodeDesignResponse, designResponseSchema } from "./design";
import { strictJsonSchema } from "./openrouter";

describe("provider design transport", () => {
  const item = newDesignItem("outdoor-kitchen", "k");
  const wire = { ...item, options: Object.entries(item.options).map(([key, value]) => ({ key, value })) };
  it("round-trips option choices and toggles without a provider record schema", () => {
    const result = decodeDesignResponse({ items: [wire], reply: "Updated" });
    expect(result.items[0]).toEqual(item);
    const json = JSON.stringify(strictJsonSchema(designResponseSchema));
    expect(json).not.toContain('"default"');
    expect(json).not.toContain('"minimum"');
  });
  it("still rejects invalid dimensions and malformed paths from the provider", () => {
    expect(() => decodeDesignResponse({ items: [{ ...wire, width: -5 }], reply: "Updated" })).toThrow();
    expect(() => decodeDesignResponse({ items: [{ ...wire, shape: "path", points: [] }], reply: "Updated" })).toThrow();
    expect(() => decodeDesignResponse({ items: Array.from({ length: 61 }, () => wire), reply: "Updated" })).toThrow();
  });
});
