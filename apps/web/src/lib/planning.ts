import { DESIGN_STEPS, designAlternativeSchema, designChecks, designQuantity, newDesignItem, planningSchema, worldPoints, type DesignAlternative, type DesignItem, type Drawing, type Planning } from "@architech/core";
import { buildGroundModel } from "@architech/measure";
import type { CProject, CVersion } from "./types";
import { uid } from "./uid";

export function initialPlanning(project: CProject, version: CVersion | null): Planning {
  if (project.planning) return structuredClone(project.planning);
  const model = project.calibration ? buildGroundModel(project.calibration) : null;
  const items: DesignItem[] = [];
  for (const d of version?.request?.drawings ?? []) {
    if (d.kind === "brush") continue;
    const item = newDesignItem(d.itemType, d.id);
    const points = model ? d.points.map((p) => model.toGround(p)) : [];
    if (points.length && points.every((p) => p !== null)) {
      const ground = points as { x: number; y: number }[];
      item.x = ground.reduce((s, p) => s + p.x, 0) / ground.length;
      item.z = ground.reduce((s, p) => s + p.y, 0) / ground.length;
      if (d.kind === "line") {
        item.shape = "path";
        item.points = ground.map((p) => ({ x: p.x - item.x, z: p.y - item.z }));
      } else {
        item.width = Math.max(0.01, Math.hypot(ground[1]!.x - ground[0]!.x, ground[1]!.y - ground[0]!.y));
        item.depth = Math.max(0.01, Math.hypot(ground[2]!.x - ground[1]!.x, ground[2]!.y - ground[1]!.y));
        item.rotation = Math.atan2(ground[1]!.y - ground[0]!.y, ground[1]!.x - ground[0]!.x) * 180 / Math.PI;
      }
    } else { item.x = 3 + items.length * 2; item.z = 4; }
    item.source = "estimated";
    if (d.kind === "line" && d.dims.lengthM) {
      // A quick drawing's length follows its route, never its cross-section.
      const length = item.points.slice(1).reduce((sum, p, n) => sum + Math.hypot(p.x - item.points[n]!.x, p.z - item.points[n]!.z), 0);
      if (length > 0) item.points = item.points.map((p) => ({ x: p.x * d.dims.lengthM! / length, z: p.z * d.dims.lengthM! / length }));
    } else if (d.dims.lengthM) item.width = d.dims.lengthM;
    if (d.dims.widthM && d.kind !== "line") item.depth = d.dims.widthM;
    if (d.dims.heightM) item.height = d.dims.heightM;
    item.options = d.options;
    item.notes = d.note;
    items.push(item);
  }
  const a = designAlternativeSchema.parse({ id: uid(), name: "My design", items, baseVersionNumber: version?.number ?? 0,
    brief: version?.request?.message ?? "", photoAligned: !!model && items.length > 0,
    width: project.calibration?.floorRect?.widthM ?? project.calibration?.roomSize?.widthM ?? 12,
    depth: project.calibration?.floorRect?.depthM ?? project.calibration?.roomSize?.lengthM ?? 10,
    units: project.calibration?.units ?? "imperial" });
  return planningSchema.parse({ revision: 0, activeId: a.id, alternatives: [a] });
}

/** A calibrated guide is optional; unaligned designs must never masquerade as photo measurements. */
export function drawingsForDesign(a: DesignAlternative, p: CProject): Drawing[] {
  const model = a.photoAligned && p.calibration ? buildGroundModel(p.calibration) : null;
  if (!model) return [];
  const result: Drawing[] = [];
  for (const item of a.items.filter((i) => i.operation !== "existing" && i.operation !== "remove").slice(0, 12)) {
    const points = worldPoints(item).map((p) => model.toImage({ x: p.x, y: p.z }));
    if (points.some((p) => !p || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) continue;
    const line = item.shape === "path";
    if (line && item.type === "lazy-river") continue; // keep the island open; do not fill the loop
    result.push({ id: item.id, number: result.length + 1, itemType: item.type, kind: line ? "line" : "area", shape: line ? "polyline" : "polygon",
      points: points as Drawing["points"], zoneHeight: item.height > 0.3 ? 0.3 : 0, options: item.options,
      note: `${item.material}. ${item.notes}`.slice(0, 500), dims: { ...(line ? {} : { lengthM: item.width, widthM: item.depth }), heightM: item.height || undefined } });
  }
  return result;
}

export function planningPacket(title: string, planning: Planning, a: DesignAlternative, photoUrl = ""): string {
  const esc = (v: unknown) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const n = (x: number) => x.toFixed(2).replace(/\.00$/, "");
  const scale = a.units === "imperial" ? 1 / 0.3048 : 1;
  const unit = a.units === "imperial" ? "ft" : "m";
  const rows = a.items.map((i) => {
    const q = designQuantity(i, a.units);
    return `<tr><td>${esc(i.name)}<br>${esc(i.operation)} · ${esc(i.source)}</td><td>${n(i.width * scale)} × ${n(i.depth * scale)} × ${n(i.height * scale)} ${unit}<br>Elevation ${n(i.elevation * scale)} ${unit}</td><td>${esc(i.material || "Not chosen")}<br>${esc(i.notes)}</td><td>${n(q.purchase)} ${q.unit}${i.costBasis === "each" ? "" : ` (includes ${i.waste}% allowance)`}</td><td>${q.cost === null ? "Price needed" : `${a.currency} ${n(q.cost)}`}</td></tr>`;
  }).join("");
  const quantities = a.items.map((i) => designQuantity(i, a.units));
  const shapes = a.items.map((i, index) => {
    const pts = worldPoints(i).map((p) => `${p.x},${p.z}`).join(" ");
    return `<g><${i.shape === "path" ? "polyline" : "polygon"} points="${pts}${i.shape === "path" && i.closed ? ` ${pts.split(" ")[0]}` : ""}" fill="${i.shape === "path" ? "none" : "#c8ded5"}" stroke="#245c4b" stroke-width="${i.shape === "path" ? i.width : 0.04}"/><text x="${i.x}" y="${i.z}" text-anchor="middle" font-size="0.35">${index + 1}</text></g>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} — project plan</title><style>body{font:15px system-ui;max-width:1000px;margin:32px auto;padding:20px;color:#172f28}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #bacbc4;padding:10px;text-align:left}svg{width:100%;height:400px;border:1px solid #bacbc4}img{max-width:100%;max-height:400px}h1,h2{break-after:avoid}tr{break-inside:avoid}@media print{body{margin:0;padding:0}button{display:none}}</style></head><body><button onclick="window.print()">Print / save PDF</button><h1>${esc(title)}</h1><p>${esc(planning.property)} · ${esc(planning.area)}</p><h2>${esc(a.name)} — revision ${a.revision}</h2><p>${esc(a.brief)}</p><p>Layout ${n(a.width * scale)} × ${n(a.depth * scale)} ${unit}; boundary ${a.boundarySource}. ${a.photoAligned ? "Photo-aligned estimate." : "Conceptual layout; not registered to a photo."}</p><svg viewBox="-1 -1 ${a.width + 2} ${a.depth + 2}" xmlns="http://www.w3.org/2000/svg"><rect width="${a.width}" height="${a.depth}" fill="#f8f6ef" stroke="#245c4b" stroke-width="0.04"/>${shapes}</svg>${photoUrl ? `<h2>Reference image</h2><img src="${esc(photoUrl)}" alt="Project reference"/>` : ""}<h2>Design and quantity assumptions</h2><p>Items below follow the numbered plan. Dimensions are ${unit}; area and volume rates use ${unit}² and ${unit}³. Path quantities use centerline length × width; volume assumes uniform height/depth. These are conceptual quantities, not a complete bill of materials.</p><table><thead><tr><th>Item</th><th>Width × depth × height</th><th>Materials / notes</th><th>Pricing quantity</th><th>Materials + labor</th></tr></thead><tbody>${rows}</tbody></table><p>Known-price subtotal: ${a.currency} ${n(quantities.reduce((s, q) => s + (q.cost ?? 0), 0))}. ${quantities.filter((q) => q.cost === null).length} item(s) still need prices. Taxes, delivery and unlisted work excluded. Prices entered ${esc(a.priceDate || "date not recorded")} for ${esc(a.location || "location not recorded")}.</p><h2>Preparation</h2><ol>${DESIGN_STEPS.map((step) => `<li>${a.completedSteps.includes(step.id) ? "✓ " : ""}<b>${step.title}</b>: ${step.text}</li>`).join("")}</ol><h2>Checks and unresolved questions</h2><ul>${designChecks(a).map((s) => `<li>${esc(s)}</li>`).join("")}</ul><p>${esc(a.notes)}</p><p>Confirm dimensions, product specifications and applicable site requirements before buying or building. Visual previews do not establish structural feasibility.</p></body></html>`;
}
