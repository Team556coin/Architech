import { colorForNumber, getItem, lookLabel, type Calibration, type ChoiceOption, type Drawing, type Reference, type Units } from "@architech/core";
import { buildGroundModel, dimensionLines, fitWarnings, formatLength, measureDrawing, quantitiesFor, referenceProblem, type FitWarning, type GroundModel, type QuantityRow } from "@architech/measure";

/** "suspect": the homeowner measured something that can't be right, so sizes would be off. */
export type ScaleStatus = "none" | "estimated" | "user" | "suspect";

export function scaleOf(cal: Calibration | null): { model: GroundModel | null; status: ScaleStatus } {
  if (!cal) return { model: null, status: "none" };
  const model = buildGroundModel(cal);
  const suspect = cal.references.some((r) => r.source === "user" && referenceProblem(cal, r));
  if (!model) return { model: null, status: suspect ? "suspect" : "none" };
  return { model, status: suspect ? "suspect" : model.fromUser ? "user" : "estimated" };
}

export interface OverlayLine {
  a: { x: number; y: number };
  b: { x: number; y: number };
  text: string;
  kind: string;
}

export interface DrawingOverlay {
  id: string;
  number: number;
  color: string;
  label: string;
  lines: OverlayLine[];
}

export function overlaysFor(drawings: Drawing[], model: GroundModel | null, units: Units): DrawingOverlay[] {
  return drawings.map((d) => {
    const item = getItem(d.itemType);
    const m = measureDrawing(d, model);
    const lines = dimensionLines(d, m, model).map((l) => ({
      a: l.a,
      b: l.b,
      kind: l.kind,
      text: formatLength(l.valueM, units, { estimated: !l.exact, preferInches: !!item.preferInches && l.kind !== "run" }),
    }));
    return { id: d.id, number: d.number, color: colorForNumber(d.number).hex, label: d.itemType === "other" && d.note ? d.note : item.label, lines };
  });
}

export interface GettingItem {
  id: string;
  number: number;
  itemType: string;
  label: string;
  icon: string;
  rows: QuantityRow[];
}

export function gettingFor(drawings: Drawing[], model: GroundModel | null, units: Units): GettingItem[] {
  const out: GettingItem[] = [];
  for (const d of drawings) {
    if (d.kind === "brush") continue;
    const m = measureDrawing(d, model);
    if (!m) continue;
    const item = getItem(d.itemType);
    out.push({ id: d.id, number: d.number, itemType: d.itemType, label: d.itemType === "other" && d.note ? d.note : item.label, icon: item.icon, rows: quantitiesFor(d.itemType, m, d.options, units, lookLabel(d.itemType, d.look)) });
  }
  return out;
}

/** Plain sentence for a fence, wall or hedge: its real height in this photo, and how long it runs. */
export function measuredSizeText(d: Drawing, model: GroundModel | null, units: Units): string | null {
  const item = getItem(d.itemType);
  if (!item.tall || d.kind === "brush") return null;
  const choice = item.options.find((o): o is ChoiceOption => o.type === "choice" && o.id === "height");
  const picked = choice?.choices.find((c) => c.id === ((d.options.height as string | undefined) ?? choice.default))?.label;
  if (!model) {
    return picked ? `Set the size of the photo to make this a true ${picked} ${item.label.toLowerCase()} in the picture.` : null;
  }
  const m = measureDrawing(d, model);
  if (!m?.heightM) return null;
  const height = formatLength(m.heightM, units, { estimated: !model.fromUser });
  const where = model.fromUser ? "in this photo" : "on the photo's estimated scale";
  const length = m.lengthM ? `${formatLength(m.lengthM, units, { estimated: !m.lengthExact })} along the ground` : null;
  return length ? `${height} tall ${where} · ${length}` : `${height} tall ${where}`;
}

export function warningsFor(drawings: Drawing[], model: GroundModel | null, cal: Calibration | null): FitWarning[] {
  if (!cal || !model) return [];
  return fitWarnings(drawings, model, cal);
}

export function referenceText(r: Reference, units: Units): string {
  const name = r.label?.trim() || (r.kind === "vertical" ? "height" : "length");
  return `${name} = ${formatLength(r.lengthM, units, { estimated: r.source === "estimated" })}`;
}

/** "Based on your measurement: back of shed = 12 ft" */
export function basisText(cal: Calibration | null, units: Units): string | null {
  if (!cal) return null;
  if (cal.floorRect) return `Based on your floor size: ${formatLength(cal.floorRect.widthM, units)} x ${formatLength(cal.floorRect.depthM, units)}`;
  const user = cal.references.filter((r) => r.source === "user");
  if (user.length) return `Based on your measurement${user.length > 1 ? "s" : ""}: ${user.map((r) => referenceText(r, units)).join(", ")}`;
  if (cal.references.length) return `Estimated from ${cal.references.map((r) => referenceText(r, units)).join(", ")}. Measure a visible edge to improve the estimate.`;
  return null;
}

export function roomSizeText(cal: Calibration | null, units: Units): string | null {
  const r = cal?.roomSize;
  if (!r?.lengthM || !r.widthM) return null;
  return `${formatLength(r.lengthM, units)} x ${formatLength(r.widthM, units)}`;
}
