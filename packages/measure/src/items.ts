import { getItem, optionHeightM, type Dims, type Drawing, type Point } from "@architech/core";
import { add, dist, dot, len, minAreaRect, polygonArea, polygonPerimeter, scale, sub, type Vec } from "./geometry";
import type { GroundModel } from "./ground";

export interface ItemMeasure {
  lengthM?: number;
  widthM?: number;
  heightM?: number;
  depthM?: number;
  diameterM?: number;
  areaM2?: number;
  perimeterM?: number;
  /** Straight runs of a line item (a corner starts a new run). */
  runsM: number[];
  lengthExact: boolean;
  widthExact?: boolean;
  heightExact?: boolean;
}

export interface DimensionLine {
  a: Point;
  b: Point;
  valueM: number;
  kind: "length" | "width" | "height" | "diameter" | "run";
  exact: boolean;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const clampPt = (p: Point): Point => ({ x: clamp01(p.x), y: clamp01(p.y) });

const FT = 0.3048;
function optionFeet(options: Drawing["options"], id: string): number | undefined {
  const v = options[id];
  if (typeof v !== "string") return undefined;
  const m = v.match(/^(\d+(?:\.\d+)?)ft$/);
  return m ? Number(m[1]) * FT : undefined;
}

/** Group consecutive segments that keep roughly the same direction into runs. */
export function splitRuns(pts: Vec[], maxTurnDeg = 15): Vec[][] {
  if (pts.length < 2) return [];
  const runs: Vec[][] = [[pts[0]!, pts[1]!]];
  for (let i = 2; i < pts.length; i++) {
    const run = runs[runs.length - 1]!;
    const prev = sub(run[run.length - 1]!, run[run.length - 2]!);
    const next = sub(pts[i]!, pts[i - 1]!);
    const cos = dot(prev, next) / Math.max(1e-12, len(prev) * len(next));
    const turn = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    if (turn <= maxTurnDeg) run.push(pts[i]!);
    else runs.push([pts[i - 1]!, pts[i]!]);
  }
  return runs;
}

const runLength = (run: Vec[]) => run.slice(1).reduce((s, p, i) => s + dist(run[i]!, p), 0);

function groundPoints(d: Drawing, model: GroundModel): Vec[] | null {
  const out: Vec[] = [];
  for (const p of d.points) {
    const g = model.toGround(p);
    if (!g) return null;
    out.push(g);
  }
  return out;
}

function specHeight(d: Drawing): number | undefined {
  return d.dims.heightM ?? optionHeightM(d.itemType, d.options);
}

export function measureDrawing(d: Drawing, model: GroundModel | null): ItemMeasure | null {
  if (!model || d.kind === "brush" || d.points.length < 2) return null;
  const g = groundPoints(d, model);
  if (!g) return null;
  const item = getItem(d.itemType);
  const heightM = item.tall ? specHeight(d) : d.dims.heightM;

  if (d.kind === "line") {
    const runs = splitRuns(g).map(runLength);
    const measured = runs.reduce((s, r) => s + r, 0);
    const lengthM = d.dims.lengthM ?? measured;
    const ratio = measured > 0 ? lengthM / measured : 1;
    const widthM = d.dims.widthM ?? optionFeet(d.options, "width");
    return {
      lengthM,
      runsM: runs.map((r) => r * ratio),
      lengthExact: d.dims.lengthM !== undefined,
      heightM,
      heightExact: heightM !== undefined,
      widthM,
      widthExact: widthM !== undefined,
      areaM2: widthM ? lengthM * widthM : undefined,
    };
  }

  const rect = minAreaRect(g);
  const isRound = d.shape === "ellipse";
  const lengthM = d.dims.lengthM ?? (isRound && d.dims.diameterM ? d.dims.diameterM : rect.length);
  const widthM = d.dims.widthM ?? (isRound && d.dims.diameterM ? d.dims.diameterM : rect.width);
  const lengthExact = d.dims.lengthM !== undefined || (isRound && d.dims.diameterM !== undefined);
  const widthExact = d.dims.widthM !== undefined || (isRound && d.dims.diameterM !== undefined);
  let areaM2 = polygonArea(g);
  if (lengthExact && widthExact) areaM2 = isRound ? (Math.PI * lengthM * widthM) / 4 : lengthM * widthM;
  const out: ItemMeasure = {
    lengthM,
    widthM,
    areaM2,
    perimeterM: polygonPerimeter(g),
    runsM: [],
    lengthExact,
    widthExact,
    heightM,
    heightExact: heightM !== undefined,
    depthM: d.dims.depthM,
  };
  if (isRound) out.diameterM = d.dims.diameterM ?? (rect.length + rect.width) / 2;
  return out;
}

/** Move a drawing's points so it matches typed real-world sizes. */
export function resizeDrawing(d: Drawing, model: GroundModel | null, dims: Dims): Drawing | null {
  const nextDims = { ...d.dims, ...dims };
  if (!model || d.kind === "brush") return { ...d, dims: nextDims };
  const g = groundPoints(d, model);
  if (!g) return null;
  let moved: Vec[];
  if (d.kind === "line") {
    const current = g.slice(1).reduce((s, p, i) => s + dist(g[i]!, p), 0);
    if (!dims.lengthM || current <= 0) return { ...d, dims: nextDims };
    const s = dims.lengthM / current;
    const origin = g[0]!;
    moved = g.map((p) => add(origin, scale(sub(p, origin), s)));
  } else {
    const rect = minAreaRect(g);
    const targetL = dims.lengthM ?? dims.diameterM ?? rect.length;
    const targetW = dims.widthM ?? dims.diameterM ?? rect.width;
    const sL = rect.length > 0 ? targetL / rect.length : 1;
    const sW = rect.width > 0 ? targetW / rect.width : 1;
    moved = g.map((p) => {
      const rel = sub(p, rect.center);
      const u = dot(rel, rect.axisL) * sL;
      const v = dot(rel, rect.axisW) * sW;
      return add(rect.center, add(scale(rect.axisL, u), scale(rect.axisW, v)));
    });
  }
  const pts: Point[] = [];
  for (const p of moved) {
    const img = model.toImage(p);
    if (!img) return null;
    pts.push(clampPt(img));
  }
  return { ...d, points: pts, dims: nextDims };
}

/** A ready-made rectangle or circle of the item's standard size, centred on a photo point. */
export function presetShape(itemType: string, center: Point, model: GroundModel | null, shape: "rect" | "ellipse"): Point[] | null {
  const item = getItem(itemType);
  const size = item.defaultSize ?? { widthM: 3, depthM: 3 };
  const n = shape === "ellipse" ? 32 : 4;
  const local = (i: number): Vec => {
    if (shape === "rect") {
      const sx = i === 0 || i === 3 ? -1 : 1;
      const sy = i < 2 ? -1 : 1;
      return { x: (sx * size.widthM) / 2, y: (sy * size.depthM) / 2 };
    }
    const t = (i / n) * Math.PI * 2;
    return { x: (Math.cos(t) * size.widthM) / 2, y: (Math.sin(t) * size.depthM) / 2 };
  };
  const gc = model?.toGround(center);
  if (model && gc) {
    const pts: Point[] = [];
    for (let i = 0; i < n; i++) {
      const img = model.toImage(add(gc, local(i)));
      if (!img) return null;
      pts.push(clampPt(img));
    }
    return pts;
  }
  // No scale yet: a reasonable on-screen shape, flattened like a floor in perspective.
  const w = 0.3;
  const h = 0.12;
  return Array.from({ length: n }, (_, i) => {
    const l = local(i);
    return clampPt({ x: center.x + (l.x / size.widthM) * w, y: center.y + (l.y / size.depthM) * h });
  });
}

/**
 * Image-y of the top of a standing item at each base point.
 * Uses the real height in perspective when the photo has a scale; otherwise the drawn zone height.
 * Null when the item does not stand up.
 */
export function standingTops(d: Drawing, model: GroundModel | null): number[] | null {
  const item = getItem(d.itemType);
  if (!item.tall || d.kind === "brush" || d.points.length < 2 || d.zoneHeight <= 0) return null;
  const heightM = specHeight(d);
  return d.points.map((p) => {
    if (model && heightM) {
      const px = model.pixelsForHeight(p, heightM);
      if (px !== null && px > 0) return clamp01(p.y - px / model.imageHeight);
    }
    return clamp01(p.y - d.zoneHeight);
  });
}

/** Zone height (fraction of photo height) that covers an item of `heightM` standing on these base points. */
export function zoneHeightFor(points: Point[], heightM: number, model: GroundModel | null): number | null {
  if (!model) return null;
  let best = 0;
  for (const p of points) {
    const px = model.pixelsForHeight(p, heightM);
    if (px === null) continue;
    best = Math.max(best, px / model.imageHeight);
  }
  return best > 0 ? Math.min(1, best) : null;
}

/** Dimension lines to draw over the photo when Measurements is on. */
export function dimensionLines(d: Drawing, m: ItemMeasure | null, model: GroundModel | null): DimensionLine[] {
  if (!m || !model || d.kind === "brush") return [];
  const g = groundPoints(d, model);
  if (!g) return [];
  const out: DimensionLine[] = [];
  const img = (v: Vec) => model.toImage(v);
  const push = (a: Vec, b: Vec, valueM: number, kind: DimensionLine["kind"], exact: boolean) => {
    const ia = img(a);
    const ib = img(b);
    if (ia && ib) out.push({ a: clampPt(ia), b: clampPt(ib), valueM, kind, exact });
  };
  if (d.kind === "line") {
    const runs = splitRuns(g);
    runs.forEach((run, i) => push(run[0]!, run[run.length - 1]!, m.runsM[i] ?? runLength(run), "run", m.lengthExact));
  } else {
    const r = minAreaRect(g);
    const hl = scale(r.axisL, r.length / 2);
    const hw = scale(r.axisW, r.width / 2);
    if (d.shape === "ellipse" && m.diameterM) {
      push(sub(r.center, hl), add(r.center, hl), m.diameterM, "diameter", m.lengthExact);
    } else {
      // Length along the front edge, width along the side edge.
      const front = add(r.center, hw);
      push(sub(front, hl), add(front, hl), m.lengthM ?? r.length, "length", m.lengthExact);
      const side = add(r.center, hl);
      push(sub(side, hw), add(side, hw), m.widthM ?? r.width, "width", m.widthExact ?? false);
    }
  }
  if (m.heightM && getItem(d.itemType).tall) {
    const tops = standingTops(d, model);
    if (d.kind === "line" && tops) {
      // A fence is the same real height at every post. Mark each end so the near post
      // is taller on screen than the far one, and both labels say that height.
      const used = new Set<number>();
      const midX = d.points.reduce((s, p) => s + p.x, 0) / d.points.length;
      for (const run of splitRuns(g)) {
        for (const end of [run[0]!, run.at(-1)!]) {
          const i = g.indexOf(end);
          if (i < 0 || used.has(i)) continue;
          used.add(i);
          const base = d.points[i]!;
          const topY = tops[i]!;
          if (base.y - topY < 0.02) continue;
          const x = clamp01(base.x + (base.x <= midX ? -0.03 : 0.03));
          out.push({ a: clampPt({ x, y: base.y }), b: clampPt({ x, y: topY }), valueM: m.heightM, kind: "height", exact: m.heightExact ?? false });
        }
      }
    } else {
      const base = [...d.points].sort((a, b) => b.y - a.y)[0]!;
      const fromTop = tops ? tops[d.points.indexOf(base)] : undefined;
      const px = fromTop === undefined ? model.pixelsForHeight(base, m.heightM) : null;
      const y = fromTop ?? (px ? base.y - px / model.imageHeight : null);
      if (y !== null) out.push({ a: base, b: clampPt({ x: base.x, y }), valueM: m.heightM, kind: "height", exact: m.heightExact ?? false });
    }
  }
  return out;
}
