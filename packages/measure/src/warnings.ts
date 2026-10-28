import { getItem, type Calibration, type Drawing } from "@architech/core";
import { minAreaRect, polygonDistance, type Vec } from "./geometry";
import type { GroundModel } from "./ground";
import { measureDrawing } from "./items";
import { formatLength } from "./units";

export interface FitWarning {
  kind: "too-big" | "clearance" | "distance" | "overlap";
  message: string;
  drawingIds: string[];
}

/** Comfortable walkway indoors (30 in). */
const MIN_WALKWAY_M = 0.762;

export function fitWarnings(drawings: Drawing[], model: GroundModel | null, cal: Calibration): FitWarning[] {
  if (!model) return [];
  const units = cal.units;
  const out: FitWarning[] = [];
  const shapes: { d: Drawing; g: Vec[]; closed: boolean }[] = [];
  for (const d of drawings) {
    if (d.kind === "brush") continue;
    const g = d.points.map((p) => model.toGround(p));
    if (g.some((p) => !p)) continue;
    shapes.push({ d, g: g as Vec[], closed: d.kind === "area" });
  }

  const roomDims = cal.floorRect
    ? [cal.floorRect.widthM, cal.floorRect.depthM]
    : cal.roomSize?.lengthM && cal.roomSize?.widthM
      ? [cal.roomSize.lengthM, cal.roomSize.widthM]
      : null;
  if (roomDims) {
    const roomL = Math.max(roomDims[0]!, roomDims[1]!);
    const roomW = Math.min(roomDims[0]!, roomDims[1]!);
    for (const s of shapes) {
      const item = getItem(s.d.itemType);
      if (item.scope === "outdoor") continue;
      const m = measureDrawing(s.d, model);
      const length = m?.lengthM ?? minAreaRect(s.g).length;
      const width = m?.widthM ?? 0;
      if (length > roomL + 0.01 || width > roomW + 0.01) {
        out.push({ kind: "too-big", message: `This ${item.label.toLowerCase()} is bigger than your room`, drawingIds: [s.d.id] });
      }
    }
  }

  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      const a = shapes[i]!;
      const b = shapes[j]!;
      const ia = getItem(a.d.itemType);
      const ib = getItem(b.d.itemType);
      const gap = polygonDistance(a.g, b.g, a.closed, b.closed);
      const names = `${ia.label} and ${ib.label}`;
      const ids = [a.d.id, b.d.id];
      if (gap === 0) {
        out.push({ kind: "overlap", message: `${names} overlap`, drawingIds: ids });
        continue;
      }
      const indoor = ia.scope !== "outdoor" && ib.scope !== "outdoor";
      if (indoor) {
        if (gap < MIN_WALKWAY_M) {
          out.push({
            kind: "clearance",
            message: `Only ${formatLength(gap, units, { preferInches: true, estimated: !model.exact })} walkway between ${names}`,
            drawingIds: ids,
          });
        }
      } else {
        out.push({ kind: "distance", message: `${formatLength(gap, units, { estimated: !model.exact })} between ${names}`, drawingIds: ids });
      }
    }
  }
  return out;
}
