import { defaultOptions, drawingSchema, getItem, looksFor, optionHeightM, type Drawing, type Point } from "@architech/core";
import { presetShape, zoneHeightFor, type GroundModel } from "@architech/measure";
import { uid } from "./uid";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const clampPt = (p: Point): Point => ({ x: clamp01(p.x), y: clamp01(p.y) });

export const nextNumber = (drawings: Drawing[]) => drawings.reduce((m, d) => Math.max(m, d.number), 0) + 1;

/** Fallback edit-zone height (fraction of the photo) for tall items when there is no scale yet. */
function fallbackZone(itemType: string): number {
  const item = getItem(itemType);
  if (!item.tall) return 0;
  const h = item.defaultHeightM ?? 1.5;
  return Math.min(0.6, Math.max(0.12, h / 4.5));
}

export function zoneFor(itemType: string, options: Drawing["options"], dims: Drawing["dims"], points: Point[], model: GroundModel | null): number {
  const item = getItem(itemType);
  if (!item.tall) return 0;
  const h = dims.heightM ?? optionHeightM(itemType, options);
  const z = h && points.length ? zoneHeightFor(points, h, model) : null;
  return z !== null ? Math.min(0.9, z * 1.08) : fallbackZone(itemType);
}

/** Starts a new drawing for an item where the person tapped. */
export function createDrawing(itemType: string, existing: Drawing[], model: GroundModel | null, at: Point): Drawing {
  const item = getItem(itemType);
  const options = defaultOptions(itemType);
  const base = {
    id: uid(),
    number: nextNumber(existing),
    itemType,
    options,
    note: "",
    dims: {},
    zoneHeight: 0,
    ...(looksFor(itemType).length ? { look: { source: "existing" as const } } : {}),
  };
  if (item.kind === "brush") return { ...base, kind: "brush", shape: "stroke", points: [], strokes: [] };
  if (item.kind === "line") {
    const points = [clampPt(at)];
    return { ...base, kind: "line", shape: "polyline", points, zoneHeight: zoneFor(itemType, options, {}, points, model) };
  }
  if (!item.defaultShape) return { ...base, kind: "area", shape: "polygon", points: [clampPt(at)] };
  const points = presetShape(itemType, at, model, item.defaultShape) ?? presetShape(itemType, at, null, item.defaultShape)!;
  return { ...base, kind: "area", shape: item.defaultShape, points, zoneHeight: zoneFor(itemType, options, {}, points, model) };
}

/** True while the person is still tapping points for this drawing. */
export const isTapToDraw = (d: Drawing) => d.kind === "line" || (d.kind === "area" && d.shape === "polygon");

export const canFinish = (d: Drawing) => (d.kind === "line" ? d.points.length >= 2 : d.kind === "area" ? d.points.length >= 3 : (d.strokes?.some((s) => !s.erase) ?? false));

export function appendPoint(d: Drawing, p: Point, model: GroundModel | null): Drawing {
  const points = [...d.points, clampPt(p)];
  return { ...d, points, zoneHeight: getItem(d.itemType).tall ? zoneFor(d.itemType, d.options, d.dims, points, model) : d.zoneHeight };
}

export function removeLastPoint(d: Drawing): Drawing {
  return { ...d, points: d.points.slice(0, -1) };
}

export function movePoint(d: Drawing, i: number, p: Point): Drawing {
  const points = d.points.map((q, j) => (j === i ? clampPt(p) : q));
  return { ...d, points };
}

export function shapeCenter(d: Drawing): Point {
  const pts = d.kind === "brush" ? (d.strokes ?? []).flatMap((s) => s.points) : d.points;
  if (!pts.length) return { x: 0.5, y: 0.5 };
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

/** Moves the whole drawing, stopping at the photo edges. */
export function translate(d: Drawing, dx: number, dy: number): Drawing {
  const pts = d.points;
  if (!pts.length) return d;
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const cdx = Math.min(1 - maxX, Math.max(-minX, dx));
  const cdy = Math.min(1 - maxY, Math.max(-minY, dy));
  return { ...d, points: pts.map((p) => ({ x: p.x + cdx, y: p.y + cdy })) };
}

export function scaleAround(d: Drawing, c: Point, sx: number, sy: number): Drawing {
  return { ...d, points: d.points.map((p) => clampPt({ x: c.x + (p.x - c.x) * sx, y: c.y + (p.y - c.y) * sy })) };
}

/** Changes item options (and keeps the edit zone tall enough for the chosen height). */
export function setOptions(d: Drawing, options: Drawing["options"], model: GroundModel | null): Drawing {
  // A dragged top stores its own height. Picking 4, 6 or 8 ft replaces that.
  const dims = options.height !== undefined && options.height !== d.options.height && d.dims.heightM !== undefined ? omitHeight(d.dims) : d.dims;
  let next: Drawing = { ...d, options, dims };
  if (d.itemType === "pool" && options.shape !== d.options.shape) {
    next = options.shape === "freeform" ? toFreeform(next) : toRect(next);
  }
  if (getItem(d.itemType).tall) next = { ...next, zoneHeight: zoneFor(d.itemType, options, next.dims, next.points, model) };
  return next;
}

function omitHeight(dims: Drawing["dims"]): Drawing["dims"] {
  const { heightM: _drop, ...rest } = dims;
  return rest;
}

/** A rounded outline with draggable corners, for freeform pools and beds. */
export function toFreeform(d: Drawing): Drawing {
  if (d.kind !== "area" || d.points.length < 3) return d;
  const c = shapeCenter(d);
  const xs = d.points.map((p) => p.x);
  const ys = d.points.map((p) => p.y);
  const rx = (Math.max(...xs) - Math.min(...xs)) / 2;
  const ry = (Math.max(...ys) - Math.min(...ys)) / 2;
  const n = 10;
  const points = Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    const wobble = 1 + 0.12 * Math.sin(t * 2 + 0.6);
    return clampPt({ x: c.x + Math.cos(t) * rx * wobble, y: c.y + Math.sin(t) * ry * wobble });
  });
  return { ...d, shape: "polygon", points };
}

function toRect(d: Drawing): Drawing {
  if (d.kind !== "area" || d.points.length < 3) return d;
  const xs = d.points.map((p) => p.x);
  const ys = d.points.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return {
    ...d,
    shape: "rect",
    points: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
  };
}

export function addStroke(d: Drawing, p: Point, size: number, erase: boolean): Drawing {
  return { ...d, strokes: [...(d.strokes ?? []), { points: [clampPt(p)], size, erase }] };
}

export function extendStroke(d: Drawing, p: Point): Drawing {
  const strokes = [...(d.strokes ?? [])];
  const last = strokes.at(-1);
  if (!last) return d;
  strokes[strokes.length - 1] = { ...last, points: [...last.points, clampPt(p)] };
  return { ...d, strokes };
}

/** Only complete drawings go to the AI, renumbered 1..n so colors and labels line up. */
export function finalizeDrawings(drawings: Drawing[]): Drawing[] {
  return drawings
    .filter((d) => canFinish(d))
    .map((d, i) => ({ ...d, number: i + 1 }))
    .filter((d) => drawingSchema.safeParse(d).success);
}
