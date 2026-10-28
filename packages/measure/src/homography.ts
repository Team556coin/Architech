import type { Vec } from "./geometry";

export type Mat3 = [number, number, number, number, number, number, number, number, number];

function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[pivot]![col]!)) pivot = r;
    if (Math.abs(M[pivot]![col]!) < 1e-10) throw new Error("Degenerate points: cannot compute homography");
    [M[col], M[pivot]] = [M[pivot]!, M[col]!];
    const row = M[col]!;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r]![col]! / row[col]!;
      if (f === 0) continue;
      for (let k = col; k <= n; k++) M[r]![k]! -= f * row[k]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}

/** Homography mapping 4 source points onto 4 destination points. */
export function computeHomography(src: Vec[], dst: Vec[]): Mat3 {
  if (src.length !== 4 || dst.length !== 4) throw new Error("Need exactly 4 point pairs");
  // Normalize source points for numerical stability.
  const cx = src.reduce((s, p) => s + p.x, 0) / 4;
  const cy = src.reduce((s, p) => s + p.y, 0) / 4;
  const sc = Math.max(1e-9, src.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / 4);
  const ns = src.map((p) => ({ x: (p.x - cx) / sc, y: (p.y - cy) / sc }));
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = ns[i]!;
    const { x: u, y: v } = dst[i]!;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve(A, b);
  const Hn: Mat3 = [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
  const T: Mat3 = [1 / sc, 0, -cx / sc, 0, 1 / sc, -cy / sc, 0, 0, 1];
  return mul3(Hn, T);
}

export function mul3(a: Mat3, b: Mat3): Mat3 {
  const r = new Array(9).fill(0) as Mat3;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j]! += a[i * 3 + k]! * b[k * 3 + j]!;
  return r;
}

export function invert3(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-14) throw new Error("Matrix is not invertible");
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

/** Returns the mapped point and the homogeneous weight (sign tells which side of the vanishing line). */
export function applyHomographyW(H: Mat3, p: Vec): { x: number; y: number; w: number } {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w, w };
}

export function applyHomography(H: Mat3, p: Vec): Vec {
  const { x, y } = applyHomographyW(H, p);
  return { x, y };
}
