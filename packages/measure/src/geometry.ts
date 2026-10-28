export interface Vec {
  x: number;
  y: number;
}

export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
export const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x;
export const len = (a: Vec) => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

export function centroid(pts: Vec[]): Vec {
  const s = pts.reduce((acc, p) => add(acc, p), { x: 0, y: 0 });
  return scale(s, 1 / Math.max(1, pts.length));
}

export function polygonArea(pts: Vec[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

export function polylineLength(pts: Vec[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1]!, pts[i]!);
  return l;
}

export function polygonPerimeter(pts: Vec[]): number {
  if (pts.length < 2) return 0;
  return polylineLength(pts) + dist(pts[pts.length - 1]!, pts[0]!);
}

export function convexHull(points: Vec[]): Vec[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length <= 2) return pts;
  const lower: Vec[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(sub(lower[lower.length - 1]!, lower[lower.length - 2]!), sub(p, lower[lower.length - 1]!)) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(sub(upper[upper.length - 1]!, upper[upper.length - 2]!), sub(p, upper[upper.length - 1]!)) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export interface OrientedRect {
  center: Vec;
  /** Angle of the long side, radians. */
  angle: number;
  length: number;
  width: number;
  /** Unit vector along the long side. */
  axisL: Vec;
  /** Unit vector along the short side. */
  axisW: Vec;
}

/** Minimum-area enclosing rectangle via rotating calipers over the convex hull. */
export function minAreaRect(points: Vec[]): OrientedRect {
  const hull = convexHull(points);
  let best: OrientedRect | null = null;
  let bestArea = Infinity;
  const n = hull.length;
  for (let i = 0; i < n; i++) {
    const p = hull[i]!;
    const q = hull[(i + 1) % n]!;
    const e = sub(q, p);
    const el = len(e);
    if (el < 1e-12) continue;
    const u = scale(e, 1 / el);
    const v = { x: -u.y, y: u.x };
    let minU = Infinity,
      maxU = -Infinity,
      minV = Infinity,
      maxV = -Infinity;
    for (const h of hull) {
      const du = dot(h, u);
      const dv = dot(h, v);
      minU = Math.min(minU, du);
      maxU = Math.max(maxU, du);
      minV = Math.min(minV, dv);
      maxV = Math.max(maxV, dv);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area < bestArea - 1e-12) {
      bestArea = area;
      const cu = (minU + maxU) / 2;
      const cv = (minV + maxV) / 2;
      const center = add(scale(u, cu), scale(v, cv));
      const du = maxU - minU;
      const dv = maxV - minV;
      best =
        du >= dv
          ? { center, angle: Math.atan2(u.y, u.x), length: du, width: dv, axisL: u, axisW: v }
          : { center, angle: Math.atan2(v.y, v.x), length: dv, width: du, axisL: v, axisW: u };
    }
  }
  if (!best) {
    const c = centroid(points);
    return { center: c, angle: 0, length: 0, width: 0, axisL: { x: 1, y: 0 }, axisW: { x: 0, y: 1 } };
  }
  return best;
}

export function pointSegmentDistance(p: Vec, a: Vec, b: Vec): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return dist(p, add(a, scale(ab, t)));
}

function segmentsIntersect(a: Vec, b: Vec, c: Vec, d: Vec): boolean {
  const d1 = cross(sub(b, a), sub(c, a));
  const d2 = cross(sub(b, a), sub(d, a));
  const d3 = cross(sub(d, c), sub(a, c));
  const d4 = cross(sub(d, c), sub(b, c));
  return d1 * d2 < 0 && d3 * d4 < 0;
}

export function segmentDistance(a: Vec, b: Vec, c: Vec, d: Vec): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}

export function pointInPolygon(p: Vec, poly: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function edges(pts: Vec[], closed: boolean): [Vec, Vec][] {
  const out: [Vec, Vec][] = [];
  for (let i = 1; i < pts.length; i++) out.push([pts[i - 1]!, pts[i]!]);
  if (closed && pts.length > 2) out.push([pts[pts.length - 1]!, pts[0]!]);
  return out;
}

/** Shortest distance between two shapes; 0 if they touch or overlap. */
export function polygonDistance(a: Vec[], b: Vec[], aClosed = true, bClosed = true): number {
  if (aClosed && b.some((p) => pointInPolygon(p, a))) return 0;
  if (bClosed && a.some((p) => pointInPolygon(p, b))) return 0;
  let best = Infinity;
  for (const [p, q] of edges(a, aClosed)) {
    for (const [r, s] of edges(b, bClosed)) {
      best = Math.min(best, segmentDistance(p, q, r, s));
      if (best === 0) return 0;
    }
  }
  return best;
}
