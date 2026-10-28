import type { Calibration, FloorRect, Point, Reference } from "@architech/core";
import { uid } from "./uid";

/** A mostly up-and-down line is a height; anything else is a length on the floor. */
export function guessKind(a: Point, b: Point, aspect: number): Reference["kind"] {
  const dx = Math.abs(a.x - b.x) * aspect;
  const dy = Math.abs(a.y - b.y);
  return dy > dx * 1.5 ? "vertical" : "ground";
}

export function addMeasurement(cal: Calibration, a: Point, b: Point, lengthM: number, kind: Reference["kind"], label?: string): Calibration {
  const [bottom, top] = a.y >= b.y ? [a, b] : [b, a];
  const ref: Reference = {
    id: `user-${uid().slice(0, 8)}`,
    kind,
    a: kind === "vertical" ? bottom : a,
    b: kind === "vertical" ? top : b,
    lengthM,
    source: "user",
    ...(label?.trim() ? { label: label.trim().slice(0, 80) } : {}),
  };
  return { ...cal, references: [...cal.references, ref] };
}

export function confirmReference(cal: Calibration, id: string): Calibration {
  return { ...cal, references: cal.references.map((r) => (r.id === id ? { ...r, source: "user" as const } : r)) };
}

export function updateReference(cal: Calibration, id: string, lengthM: number): Calibration {
  return { ...cal, references: cal.references.map((r) => (r.id === id ? { ...r, lengthM, source: "user" as const } : r)) };
}

export function removeReference(cal: Calibration, id: string): Calibration {
  return { ...cal, references: cal.references.filter((r) => r.id !== id) };
}

/** Floor corners in order back-left, back-right, front-right, front-left; width is left-right, depth is front-back. */
export function setFloorRect(cal: Calibration, corners: FloorRect["corners"], widthM: number, depthM: number): Calibration {
  return { ...cal, floorRect: { corners, widthM, depthM }, roomSize: { ...cal.roomSize, lengthM: widthM, widthM: depthM } };
}

export function clearFloorRect(cal: Calibration): Calibration {
  const { floorRect: _drop, ...rest } = cal;
  return rest;
}
