import type { Calibration, Point, Reference } from "@architech/core";
import { centroid, dist, type Vec } from "./geometry";
import { applyHomographyW, computeHomography, invert3 } from "./homography";

/**
 * Maps between photo points (normalized 0..1) and real-world ground coordinates (meters).
 * Heights are measured for things standing on the ground.
 */
export interface GroundModel {
  kind: "homography" | "horizon";
  /** Every input was typed or confirmed by the user. */
  exact: boolean;
  /** At least one user measurement was used. */
  fromUser: boolean;
  toGround(p: Point): Vec | null;
  toImage(g: Vec): Point | null;
  /** Real height of something whose base touches the ground at `base`. */
  heightAt(base: Point, top: Point): number | null;
  /** Photo pixels a real height spans when standing at `base`. */
  pixelsForHeight(base: Point, heightM: number): number | null;
  /** Meters per photo pixel, sideways, at a ground point. */
  localScale(p: Point): number | null;
  imageWidth: number;
  imageHeight: number;
}

/** Typical phone main camera (about 26 mm equivalent): focal length is ~0.72 of the long edge. */
export const defaultFocalPx = (w: number, h: number) => 0.72 * Math.max(w, h);

export function buildGroundModel(cal: Calibration): GroundModel | null {
  if (cal.floorRect) return homographyModel(cal);
  return horizonModel(cal);
}

function withCommon(
  W: number,
  H: number,
  toGroundPx: (p: Vec) => Vec | null,
  toImagePx: (g: Vec) => Vec | null,
): Pick<GroundModel, "toGround" | "toImage" | "heightAt" | "pixelsForHeight" | "localScale" | "imageWidth" | "imageHeight"> {
  const toPx = (p: Point): Vec => ({ x: p.x * W, y: p.y * H });
  const localScalePx = (px: Vec): number | null => {
    const a = toGroundPx(px);
    const b = toGroundPx({ x: px.x + 1, y: px.y });
    if (!a || !b) return null;
    return dist(a, b);
  };
  return {
    imageWidth: W,
    imageHeight: H,
    toGround: (p) => toGroundPx(toPx(p)),
    toImage: (g) => {
      const px = toImagePx(g);
      return px ? { x: px.x / W, y: px.y / H } : null;
    },
    localScale: (p) => localScalePx(toPx(p)),
    heightAt: (base, top) => {
      const s = localScalePx(toPx(base));
      if (s === null) return null;
      return Math.max(0, (base.y - top.y) * H) * s;
    },
    pixelsForHeight: (base, heightM) => {
      const s = localScalePx(toPx(base));
      if (s === null || s === 0) return null;
      return heightM / s;
    },
  };
}

function homographyModel(cal: Calibration): GroundModel | null {
  const W = cal.imageWidth;
  const H = cal.imageHeight;
  const rect = cal.floorRect!;
  const src = rect.corners.map((p) => ({ x: p.x * W, y: p.y * H }));
  const dst = [
    { x: 0, y: 0 },
    { x: rect.widthM, y: 0 },
    { x: rect.widthM, y: rect.depthM },
    { x: 0, y: rect.depthM },
  ];
  let Hm, Hi;
  try {
    Hm = computeHomography(src, dst);
    Hi = invert3(Hm);
  } catch {
    return null;
  }
  const validSign = Math.sign(applyHomographyW(Hm, centroid(src)).w);
  const toGroundPx = (p: Vec) => {
    const r = applyHomographyW(Hm, p);
    if (Math.sign(r.w) !== validSign || !Number.isFinite(r.x) || !Number.isFinite(r.y)) return null;
    return { x: r.x, y: r.y };
  };
  const toImagePx = (g: Vec) => {
    const r = applyHomographyW(Hi, g);
    if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) return null;
    return { x: r.x, y: r.y };
  };
  return { kind: "homography", exact: true, fromUser: true, ...withCommon(W, H, toGroundPx, toImagePx) };
}

function horizonFrame(cal: Calibration) {
  const W = cal.imageWidth;
  const H = cal.imageHeight;
  const yh = (cal.horizonY ?? 0.5) * H;
  const f = cal.focalPx ?? defaultFocalPx(W, H);
  const cx = W / 2;
  const unit = (p: Vec): Vec | null => {
    const d = p.y - yh;
    if (d <= 0.5) return null;
    return { x: (p.x - cx) / d, y: f / d };
  };
  return { W, H, yh, f, cx, unit };
}

/**
 * How high the camera must have been for this reference to be true, in meters.
 * Null when the reference can't be on the ground (for example, it's above the horizon).
 */
export function impliedCameraHeight(cal: Calibration, r: Reference): number | null {
  const { W, H, yh, unit } = horizonFrame(cal);
  const a = { x: r.a.x * W, y: r.a.y * H };
  const b = { x: r.b.x * W, y: r.b.y * H };
  if (r.kind === "ground") {
    const ga = unit(a);
    const gb = unit(b);
    if (!ga || !gb) return null;
    const l = dist(ga, gb);
    return l > 1e-9 ? r.lengthM / l : null;
  }
  const bottom = a.y >= b.y ? a : b;
  const top = a.y >= b.y ? b : a;
  if (bottom.y - yh <= 0.5 || bottom.y - top.y < 1) return null;
  return (r.lengthM * (bottom.y - yh)) / (bottom.y - top.y);
}

/** Photos are taken from roughly crouching height up to a second-story window. */
export const PLAUSIBLE_CAMERA_HEIGHT_M = { min: 0.5, max: 10 };

export type ReferenceProblem = "not_on_floor" | "size_mismatch";

/** Spots a reference that would give nonsense sizes, before it's saved. */
export function referenceProblem(cal: Calibration, r: Reference): ReferenceProblem | null {
  if (cal.floorRect) return null;
  const h = impliedCameraHeight(cal, r);
  const ok = h !== null && h >= PLAUSIBLE_CAMERA_HEIGHT_M.min && h <= PLAUSIBLE_CAMERA_HEIGHT_M.max;
  if (ok) return null;
  return r.kind === "vertical" ? "not_on_floor" : "size_mismatch";
}

function horizonModel(cal: Calibration): GroundModel | null {
  const { W, H, yh, f, cx, unit } = horizonFrame(cal);
  const userRefs = cal.references.filter((r) => r.source === "user");
  const refs = userRefs.length ? userRefs : cal.references;

  const heights = refs.map((r) => impliedCameraHeight(cal, r)).filter((h): h is number => h !== null);
  if (!heights.length) return null;
  const camH = heights.reduce((s, h) => s + h, 0) / heights.length;

  const toGroundPx = (p: Vec) => {
    const u = unit(p);
    return u ? { x: u.x * camH, y: u.y * camH } : null;
  };
  const toImagePx = (g: Vec) => {
    if (g.y <= 1e-9) return null;
    return { x: cx + (g.x * f) / g.y, y: yh + (f * camH) / g.y };
  };
  const fromUser = userRefs.length > 0;
  const exact = fromUser && refs === userRefs && cal.horizonSource === "user";
  return { kind: "horizon", exact, fromUser, ...withCommon(W, H, toGroundPx, toImagePx) };
}
