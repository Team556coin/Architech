import { designItemSchema } from "@architech/core";
import { z } from "zod";

// Keep provider schemas simple; enforce all bounds and geometry invariants after
// decoding. Options use explicit entries instead of an open-ended object schema.
export const designResponseSchema = z.object({
  items: z.array(z.object({
    id: z.string(), type: z.string(), name: z.string(),
    x: z.number(), z: z.number(), elevation: z.number(),
    width: z.number(), depth: z.number(), height: z.number(), rotation: z.number(),
    shape: z.enum(["rectangle", "ellipse", "path"]),
    points: z.array(z.object({ x: z.number(), z: z.number() })),
    closed: z.boolean(), curved: z.boolean(), material: z.string(), notes: z.string(),
    operation: z.enum(["add", "change", "remove", "existing"]),
    source: z.enum(["desired", "measured", "estimated"]), locked: z.boolean(), group: z.string(),
    clearance: z.number(), waste: z.number(), costBasis: z.enum(["each", "length", "area", "volume"]),
    unitCost: z.number().nullable(), laborCost: z.number(),
    options: z.array(z.object({ key: z.string(), value: z.union([z.string(), z.boolean()]) })),
  })),
  reply: z.string(),
});

export function decodeDesignResponse(result: z.infer<typeof designResponseSchema>) {
  return z.object({ items: z.array(designItemSchema).max(60), reply: z.string().max(1500) }).parse({ ...result, items: result.items.map((item) => ({ ...item, options: Object.fromEntries(item.options.map((o) => [o.key, o.value])) })) });
}
