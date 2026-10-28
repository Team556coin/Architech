import { z } from "zod";
import { designAlternativeSchema, referencePhotoSchema } from "./design";

export const SPACE_TYPES = [
  "bathroom",
  "kitchen",
  "bedroom",
  "living-room",
  "dining-room",
  "hallway",
  "office",
  "laundry",
  "basement",
  "garage",
  "backyard",
  "front-yard",
  "patio-porch",
  "house-exterior",
  "other",
] as const;
export type SpaceType = (typeof SPACE_TYPES)[number];

export const OUTDOOR_SPACES: readonly SpaceType[] = ["backyard", "front-yard", "patio-porch", "house-exterior"];
export const isOutdoor = (s: SpaceType) => OUTDOOR_SPACES.includes(s);

/** Points are normalized to the photo: 0..1 on both axes, origin top-left. */
export const pointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
export type Point = z.infer<typeof pointSchema>;

export const strokeSchema = z.object({
  points: z.array(pointSchema).min(1),
  /** Brush diameter as a fraction of the photo width. */
  size: z.number().positive().max(0.5),
  erase: z.boolean().default(false),
});
export type Stroke = z.infer<typeof strokeSchema>;

export const dimsSchema = z
  .object({
    lengthM: z.number().positive().optional(),
    widthM: z.number().positive().optional(),
    heightM: z.number().positive().optional(),
    depthM: z.number().positive().optional(),
    diameterM: z.number().positive().optional(),
  })
  .default({});
export type Dims = z.infer<typeof dimsSchema>;

/** Where the boards or finish for a new item come from. */
export const lookSchema = z.object({
  source: z.enum(["existing", "preset", "photo"]),
  presetId: z.string().max(40).optional(),
  /** Storage key of a photo the homeowner uploaded, such as a close-up of fence boards. */
  photoKey: z.string().max(500).optional(),
});
export type Look = z.infer<typeof lookSchema>;

export const drawingSchema = z
  .object({
    id: z.string().min(1),
    number: z.number().int().positive(),
    itemType: z.string().min(1),
    kind: z.enum(["line", "area", "brush"]),
    shape: z.enum(["polyline", "polygon", "rect", "ellipse", "stroke"]),
    points: z.array(pointSchema).default([]),
    strokes: z.array(strokeSchema).optional(),
    /** For tall items: how far the edit zone extends above the drawing, as a fraction of photo height. */
    zoneHeight: z.number().min(0).max(1).default(0),
    options: z.record(z.string(), z.union([z.string(), z.boolean()])).default({}),
    /** Boards or finish to copy. Omitted items use the catalog defaults. */
    look: lookSchema.optional(),
    note: z.string().max(500).default(""),
    /** Sizes the user typed. These are exact; everything else is estimated. */
    dims: dimsSchema,
  })
  .superRefine((d, ctx) => {
    if (d.kind === "line" && d.points.length < 2) {
      ctx.addIssue({ code: "custom", message: "A line needs at least 2 points", path: ["points"] });
    }
    if (d.kind === "area" && d.points.length < 3) {
      ctx.addIssue({ code: "custom", message: "An area needs at least 3 points", path: ["points"] });
    }
    if (d.kind === "brush" && (!d.strokes || d.strokes.length === 0)) {
      ctx.addIssue({ code: "custom", message: "A brush drawing needs strokes", path: ["strokes"] });
    }
  });
export type Drawing = z.infer<typeof drawingSchema>;

export const referenceSchema = z.object({
  id: z.string().min(1),
  /** ground: both ends on the floor/ground. vertical: a is the bottom (on the ground), b is the top. */
  kind: z.enum(["ground", "vertical"]),
  a: pointSchema,
  b: pointSchema,
  lengthM: z.number().positive(),
  source: z.enum(["user", "estimated"]),
  label: z.string().max(80).optional(),
});
export type Reference = z.infer<typeof referenceSchema>;

export const floorRectSchema = z.object({
  /** Image corners in order: back-left, back-right, front-right, front-left. */
  corners: z.tuple([pointSchema, pointSchema, pointSchema, pointSchema]),
  widthM: z.number().positive(),
  depthM: z.number().positive(),
});
export type FloorRect = z.infer<typeof floorRectSchema>;

export const calibrationSchema = z.object({
  imageWidth: z.number().int().positive(),
  imageHeight: z.number().int().positive(),
  /** Focal length in pixels for the stored image size (from EXIF when available). */
  focalPx: z.number().positive().optional(),
  /** Horizon row as a fraction of photo height (may be negative or > 1 for steep tilts). */
  horizonY: z.number().min(-2).max(3).optional(),
  horizonSource: z.enum(["user", "estimated"]).optional(),
  references: z.array(referenceSchema).default([]),
  floorRect: floorRectSchema.optional(),
  roomSize: z
    .object({
      lengthM: z.number().positive().optional(),
      widthM: z.number().positive().optional(),
      ceilingM: z.number().positive().optional(),
    })
    .optional(),
  units: z.enum(["imperial", "metric"]).default("imperial"),
});
export type Calibration = z.infer<typeof calibrationSchema>;
export type Units = Calibration["units"];

export const keepItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(60),
  keep: z.boolean().default(true),
});
export type KeepItem = z.infer<typeof keepItemSchema>;

export const editRequestSchema = z
  .object({
    message: z.string().max(2000).default(""),
    drawings: z.array(drawingSchema).max(12).default([]),
    keep: z.array(keepItemSchema).max(40).default([]),
    /** Edit the original photo instead of the selected version. */
    fromOriginal: z.boolean().default(false),
    design: z.lazy(() => designAlternativeSchema).optional(),
    contextPhotos: z.array(z.lazy(() => referencePhotoSchema)).max(4).optional(),
    basePhoto: z.lazy(() => referencePhotoSchema).optional(),
  })
  .refine((r) => r.message.trim().length > 0 || r.drawings.length > 0, {
    message: "Tell us what to change or draw something",
    path: ["message"],
  });
export type EditRequest = z.infer<typeof editRequestSchema>;

export const DRAWING_COLORS = [
  { name: "coral red", hex: "#F0503C" },
  { name: "blue", hex: "#2F6FEB" },
  { name: "purple", hex: "#8B3FE0" },
  { name: "orange", hex: "#F59E0B" },
  { name: "teal", hex: "#0FA3A3" },
  { name: "pink", hex: "#E0399A" },
] as const;

export const colorForNumber = (n: number) => DRAWING_COLORS[(Math.max(1, n) - 1) % DRAWING_COLORS.length]!;
