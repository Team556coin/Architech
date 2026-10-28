import { z } from "zod";
import { defaultOptions, describeItem, getItem } from "./catalog";

const size = z.number().finite().min(0.01).max(1000);
const coordinate = z.number().finite().min(-1000).max(1000);
export const worldPointSchema = z.object({ x: coordinate, z: coordinate });
export const designItemSchema = z.object({
  id: z.string().min(1).max(80), type: z.string().min(1).max(80), name: z.string().min(1).max(80),
  x: coordinate.default(0), z: coordinate.default(0), elevation: coordinate.default(0),
  width: size, depth: size, height: z.number().finite().min(0).max(100),
  rotation: z.number().finite().min(-360).max(360).default(0),
  shape: z.enum(["rectangle", "ellipse", "path"]).default("rectangle"),
  points: z.array(worldPointSchema).max(100).default([]), closed: z.boolean().default(false),
  curved: z.boolean().default(false),
  material: z.string().max(300).default(""), notes: z.string().max(1000).default(""),
  operation: z.enum(["add", "change", "remove", "existing"]).default("add"),
  source: z.enum(["desired", "measured", "estimated"]).default("desired"),
  locked: z.boolean().default(false), group: z.string().max(80).default(""),
  options: z.record(z.string(), z.union([z.string(), z.boolean()])).default({}),
  clearance: z.number().finite().min(0).max(30).default(0),
  waste: z.number().finite().min(0).max(50).default(10),
  costBasis: z.enum(["each", "length", "area", "volume"]).default("each"),
  unitCost: z.number().finite().min(0).max(10000000).nullable().default(null),
  laborCost: z.number().finite().min(0).max(10000000).default(0),
}).refine((item) => item.shape !== "path" || item.points.length >= 2, "A path needs at least two points");
export type DesignItem = z.infer<typeof designItemSchema>;

export const designAlternativeSchema = z.object({
  id: z.string().min(1).max(80), name: z.string().min(1).max(80), revision: z.number().int().nonnegative().default(0),
  baseVersionNumber: z.number().int().nonnegative().default(0),
  referenceId: z.string().max(80).nullable().default(null),
  width: size.default(12), depth: size.default(10),
  units: z.enum(["imperial", "metric"]).default("imperial"),
  boundarySource: z.enum(["estimated", "measured"]).default("estimated"),
  photoAligned: z.boolean().default(false),
  items: z.array(designItemSchema).max(60).default([]),
  brief: z.string().max(3000).default(""), notes: z.string().max(4000).default(""),
  currency: z.enum(["USD", "CAD", "GBP", "EUR", "AUD"]).default("USD"),
  completedSteps: z.array(z.string().max(80)).max(30).default([]),
  priceDate: z.string().max(30).default(""), location: z.string().max(120).default(""),
}).refine((a) => new Set(a.items.map((i) => i.id)).size === a.items.length, "Item IDs must be unique");
export type DesignAlternative = z.infer<typeof designAlternativeSchema>;

export const referencePhotoSchema = z.object({ id: z.string().min(1).max(80), label: z.string().max(120), dataUrl: z.string().max(300000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/) });

export const planningSchema = z.object({
  revision: z.number().int().nonnegative(), activeId: z.string().max(80),
  property: z.string().max(120).default(""), area: z.string().max(120).default(""),
  photos: z.array(referencePhotoSchema).max(4).default([]),
  alternatives: z.array(designAlternativeSchema).min(1).max(12),
}).superRefine((p, ctx) => {
  if (!p.alternatives.some((a) => a.id === p.activeId)) ctx.addIssue({ code: "custom", message: "Choose an existing alternative", path: ["activeId"] });
  if (new Set(p.alternatives.map((a) => a.id)).size !== p.alternatives.length) ctx.addIssue({ code: "custom", message: "Alternative IDs must be unique", path: ["alternatives"] });
});
export type Planning = z.infer<typeof planningSchema>;

export function newDesignItem(type: string, id: string): DesignItem {
  const item = getItem(type);
  const line = item.kind === "line" || type === "lazy-river";
  return designItemSchema.parse({ id, type, name: item.label === "Other" ? "Custom idea" : item.label, options: defaultOptions(type),
    width: type === "lazy-river" ? 1.5 : line ? 0.15 : item.defaultSize?.widthM ?? 2,
    depth: item.defaultSize?.depthM ?? 2, height: item.defaultHeightM ?? (item.tall ? 1 : 0.1),
    shape: line ? "path" : item.defaultShape === "ellipse" ? "ellipse" : "rectangle",
    points: line ? (type === "lazy-river" ? [{ x: -3, z: -2 }, { x: 3, z: -2 }, { x: 3, z: 2 }, { x: -3, z: 2 }] : [{ x: -2, z: 0 }, { x: 2, z: 0 }]) : [],
    closed: type === "lazy-river", curved: type === "lazy-river", costBasis: ["patio", "deck", "flower-bed"].includes(type) ? "area" : line ? "length" : "each",
  });
}

export function worldPoints(item: DesignItem): { x: number; z: number }[] {
  const radians = item.rotation * Math.PI / 180;
  const points = item.shape === "path" ? (item.curved ? smoothRoute(item.points, item.closed) : item.points) : item.shape === "ellipse"
    ? Array.from({ length: 32 }, (_, n) => ({ x: Math.cos(n * Math.PI / 16) * item.width / 2, z: Math.sin(n * Math.PI / 16) * item.depth / 2 }))
    : [{ x: -item.width / 2, z: -item.depth / 2 }, { x: item.width / 2, z: -item.depth / 2 }, { x: item.width / 2, z: item.depth / 2 }, { x: -item.width / 2, z: item.depth / 2 }];
  return points.map((p) => ({ x: item.x + p.x * Math.cos(radians) - p.z * Math.sin(radians), z: item.z + p.x * Math.sin(radians) + p.z * Math.cos(radians) }));
}

/** Rounded quadratic corners stay within the control polygon, avoiding spline overshoot. */
export function smoothRoute(points: { x: number; z: number }[], closed: boolean) {
  if (points.length < 3) return points;
  const middle = (a: typeof points[number], b: typeof a) => ({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
  const out: typeof points = closed ? [] : [points[0]!];
  for (let i = closed ? 0 : 1; i < (closed ? points.length : points.length - 1); i++) {
    const p = points[i]!, a = middle(points[(i - 1 + points.length) % points.length]!, p), b = middle(p, points[(i + 1) % points.length]!);
    for (let n = 0; n < 8; n++) { const t = n / 8; out.push({ x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * p.x + t * t * b.x, z: (1 - t) ** 2 * a.z + 2 * (1 - t) * t * p.z + t * t * b.z }); }
    out.push(b);
  }
  if (!closed) out.push(points.at(-1)!);
  return out;
}

/** Geometry, never an AI-generated purchase quantity. Prices use the alternative's display units. */
export function designQuantity(item: DesignItem, units: DesignAlternative["units"]) {
  const points = worldPoints(item);
  let length = item.width;
  if (item.shape === "path") {
    length = points.slice(1).reduce((total, p, i) => total + Math.hypot(p.x - points[i]!.x, p.z - points[i]!.z), 0);
    if (item.closed) length += Math.hypot(points[0]!.x - points.at(-1)!.x, points[0]!.z - points.at(-1)!.z);
  }
  const area = item.shape === "path" ? length * item.width : item.width * item.depth * (item.shape === "ellipse" ? Math.PI / 4 : 1);
  const volume = area * item.height;
  const scale = units === "imperial" ? 1 / 0.3048 : 1;
  const amount = item.costBasis === "each" ? 1 : item.costBasis === "length" ? length * scale : item.costBasis === "area" ? area * scale ** 2 : volume * scale ** 3;
  const purchase = amount * (item.costBasis === "each" ? 1 : 1 + item.waste / 100);
  return { length, area, volume, amount, purchase, unit: item.costBasis === "each" ? "each" : `${units === "imperial" ? "ft" : "m"}${item.costBasis === "area" ? "²" : item.costBasis === "volume" ? "³" : ""}`,
    cost: item.unitCost === null ? null : purchase * item.unitCost + item.laborCost };
}

export function designChecks(a: DesignAlternative): string[] {
  const checks: string[] = [];
  for (const item of a.items) {
    const points = worldPoints(item);
    const pad = (item.shape === "path" ? item.width / 2 : 0) + item.clearance;
    if (points.some((p) => p.x - pad < 0 || p.x + pad > a.width || p.z - pad < 0 || p.z + pad > a.depth)) checks.push(`${item.name}: footprint or selected clearance extends beyond the layout boundary.`);
    if (item.source === "estimated") checks.push(`${item.name}: dimensions came from an estimate; measure on site.`);
    if (item.type === "lazy-river") checks.push(`${item.name}: volume uses uniform depth and centerline length; curves and junctions need a detailed survey and specialist design.`);
    if (["interior-wall", "remove-area", "patio-cover", "play-structure", "pool", "outdoor-kitchen"].includes(item.type)) checks.push(`${item.name}: confirm site, structural, utility and installation requirements for this design.`);
  }
  const bounds = a.items.filter((i) => i.operation !== "remove").map((item) => { const p = worldPoints(item), pad = item.clearance + (item.shape === "path" ? item.width / 2 : 0); return { item, x0: Math.min(...p.map((p) => p.x)) - pad, x1: Math.max(...p.map((p) => p.x)) + pad, z0: Math.min(...p.map((p) => p.z)) - pad, z1: Math.max(...p.map((p) => p.z)) + pad }; });
  const layered = new Set(["patio", "deck", "flooring", "patio-cover", "pergola", "gazebo"]);
  for (let i = 0; i < bounds.length; i++) for (let j = i + 1; j < bounds.length; j++) {
    const x = bounds[i]!, y = bounds[j]!;
    if (x.item.group && x.item.group === y.item.group) continue;
    if (x.item.type !== y.item.type && (layered.has(x.item.type) || layered.has(y.item.type))) continue;
    if (x.x0 < y.x1 && x.x1 > y.x0 && x.z0 < y.z1 && x.z1 > y.z0) checks.push(`${x.item.name} and ${y.item.name}: layout envelopes overlap. Check spacing in the plan; this conservative check includes selected clearances.`);
  }
  return checks;
}

export const DESIGN_STEPS = [
  { id: "measure", title: "Measure the space", text: "Confirm the boundary, elevations and each critical dimension on site." },
  { id: "layout", title: "Check the layout", text: "Check doors, access, clearances and connections to existing structures." },
  { id: "requirements", title: "Resolve installation requirements", text: "Identify utilities and obtain the product, local and professional requirements relevant to the work." },
  { id: "materials", title: "Choose materials", text: "Confirm product coverage, waste, quantities and current local prices." },
  { id: "sequence", title: "Prepare the work", text: "Arrange access, tools, delivery, site preparation and any specialist work before installation." },
  { id: "review", title: "Review before building", text: "Share the selected alternative and unresolved questions with everyone doing the work." },
] as const;

export function describeDesign(a: DesignAlternative): string {
  return [`Design alternative: ${a.name}, revision ${a.revision}. ${a.brief}`, `Layout ${a.width} m by ${a.depth} m. Coordinates are meters from the layout origin. ${a.photoAligned ? "Layout aligned to the photo scale." : "Unaligned conceptual layout: do not claim exact placement in the photo."}`,
    ...a.items.map((i) => `${i.id}: ${i.operation} ${i.name} (${i.type}), center x=${i.x} z=${i.z}, width=${i.width} depth=${i.depth} height=${i.height} elevation=${i.elevation} m, rotation=${i.rotation} degrees; ${i.shape}${i.shape === "path" ? ` route ${JSON.stringify(worldPoints(i))}, closed=${i.closed}` : ""}; material=${i.material}; specification=${describeItem(i.type, i.options)}; options=${JSON.stringify(i.options)}; ${i.notes}${i.locked ? "; LOCKED: preserve its size, position and material" : ""}`)].join("\n");
}
