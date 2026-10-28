import { colorForNumber, describeItem, getItem, getLook, looksFor, type Drawing, type KeepItem, type Units } from "@architech/core";
import { formatLength, type ItemMeasure } from "@architech/measure";

function sizePhrase(d: Drawing, m: ItemMeasure | undefined, units: Units): string {
  if (!m) return "";
  const item = getItem(d.itemType);
  const L = (v: number, exact?: boolean) => `${exact ? "" : "about "}${formatLength(v, units, { preferInches: item.preferInches })}`;
  const parts: string[] = [];
  if (d.kind === "line") {
    if (m.runsM.length > 1) parts.push(`${m.runsM.length} straight runs of ${m.runsM.map((r) => L(r, m.lengthExact).replace(/^about /, "")).join(" and ")} (${m.lengthExact ? "" : "about "}${formatLength(m.lengthM ?? 0, units)} total)`);
    else if (m.lengthM) parts.push(`${L(m.lengthM, m.lengthExact)} long`);
  } else if (d.shape === "ellipse" && m.diameterM) {
    parts.push(`${L(m.diameterM, m.lengthExact)} across`);
  } else if (m.lengthM && m.widthM) {
    parts.push(`${L(m.lengthM, m.lengthExact)} by ${formatLength(m.widthM, units, { preferInches: item.preferInches })}`);
  }
  if (m.heightM && item.tall && !describeItem(d.itemType, d.options).includes("tall")) parts.push(`${formatLength(m.heightM, units, { preferInches: item.preferInches })} tall`);
  return parts.length ? `, ${parts.join(", ")}` : "";
}

const stands = (d: Drawing) => getItem(d.itemType).tall && d.zoneHeight > 0 && d.kind !== "brush";

/** How the new item should look, including which attached image holds the boards. */
export function lookPhrase(d: Drawing, sampleImage?: number): string {
  if (!looksFor(d.itemType).length && !d.look) return "";
  const source = d.look?.source ?? (looksFor(d.itemType).length ? "existing" : undefined);
  if (source === "existing") return " Use the same boards, color, posts, gaps and finish as the fence already in the photo, so this new run looks like it was built with that fence.";
  if (source === "preset") {
    const preset = getLook(d.itemType, d.look?.presetId);
    const sample = sampleImage ? ` Image ${sampleImage} is a close-up of these exact boards; copy that pattern, color and spacing, and ignore the background of the sample.` : "";
    return ` Boards: ${preset?.prompt ?? "the selected style"}.${sample}`;
  }
  if (source === "photo") {
    const sample = sampleImage ? ` Image ${sampleImage} is the homeowner's photo of the boards to copy.` : " A photo of the boards was provided.";
    return `${sample} Match that board shape, color, grain, gaps and finish. Do not copy the background of the sample, and do not paste the sample into the yard.`;
  }
  return "";
}

/** One line telling the image model what a colored mark means. */
export function describeDrawingForPrompt(d: Drawing, m: ItemMeasure | undefined, units: Units, sampleImage?: number): string {
  const color = colorForNumber(d.number).name;
  const what = describeItem(d.itemType, d.options, d.note) || "the change the user asked for";
  const size = sizePhrase(d, m, units);
  const look = lookPhrase(d, sampleImage);
  if (d.kind === "line" && stands(d)) {
    return `#${d.number} (${color} line): build a ${what}${size}. On the guide, the ${color} shape is this item standing in the photo. Its bottom edge is exactly where the base meets the ground: plant posts in the ground on that edge, point by point, including corners, touching soil, grass or floor. Its top edge is the true height in this photo's perspective: match it, no shorter and no taller. It is one continuous vertical plane, built the way a contractor would (posts in the ground, panels between them). Anything already closer to the camera, such as a car, stays fully visible and unchanged, and this item runs behind it. Do not remove those objects, do not rest this item on them, and do not stop it where they stand.${look}`;
  }
  if (d.kind === "line") {
    return `#${d.number} (${color} line): build a ${what}${size}. The line marks exactly where its base meets the ground; follow it point by point, including corners.${look}`;
  }
  if (d.kind === "area" && stands(d)) {
    return `#${d.number} (${color} outline): build a ${what}${size}. The outline on the ground is its footprint; fill that footprint and do not extend past it. The top of the ${color} shape is its true height: match it. Its base sits on the intended ground, patio, deck or floor, never on unrelated foreground objects.${look}`;
  }
  if (d.kind === "area") {
    return `#${d.number} (${color} outline): build a ${what}${size}. The outline is its footprint on the ground/floor; it must fill the outline and not extend past it.${look}`;
  }
  return `#${d.number} (${color} painted area): ${what === "change" ? "change what is painted" : what}${size}. Only the painted area changes.${look}`;
}

export interface PromptInput {
  /** The planner's precise description of the change. */
  plan: string;
  keep: KeepItem[];
  drawings: Drawing[];
  measures: Record<string, ItemMeasure | undefined>;
  units: Units;
  hasGuide: boolean;
  /** Close-up images attached after the photo and the placement guide. */
  samples?: { drawingId: string; imageNumber: number }[];
  retryFeedback?: string[];
}

/** Final instruction for the image model, with the realism and structure locks always included. */
export function buildEditPrompt(input: PromptInput): string {
  const kept = input.keep.filter((k) => k.keep).map((k) => k.label);
  const lines: string[] = [];
  lines.push("Edit the FIRST image, a real photo of a home. Return the same photo with only the requested change, photorealistic, as if a professional actually built it.");
  lines.push("");
  lines.push(`Requested change: ${input.plan.trim()}`);
  if (input.drawings.length) {
    lines.push("");
    lines.push(
      input.hasGuide
        ? "The second image is the same photo with colored placement marks drawn by the homeowner. Use it only to locate each item:"
        : "Placement:",
    );
    for (const d of input.drawings) {
      const sample = input.samples?.find((s) => s.drawingId === d.id)?.imageNumber;
      lines.push(`- ${describeDrawingForPrompt(d, input.measures[d.id], input.units, sample)}`);
    }
    if (input.samples?.length) {
      lines.push("Images after the placement guide are close-ups of the boards to copy. Copy that material onto the new item only. Do not copy the sample background, and do not paste the sample photo into the scene.");
    }
    const standing = input.drawings.filter(stands);
    if (standing.length) {
      const heights = standing
        .map((d) => {
          const h = input.measures[d.id]?.heightM;
          if (!h) return "";
          const item = getItem(d.itemType);
          return `${item.noun} ${formatLength(h, input.units, { preferInches: item.preferInches })} tall`;
        })
        .filter(Boolean);
      lines.push("Only change pixels inside the colored shapes. A standing item's shape runs from the ground line up to its true top. Do not build it taller or shorter than that shape, and do not move its base off the bottom edge. Leave every other pixel exactly as it is.");
      lines.push(`The bottom edge is the ground. The base touches the ground. It does not float, and it does not sit on a car or unrelated object. A patio, deck or floor explicitly used as the supporting surface is valid.${heights.length ? ` Design sizes: ${heights.join("; ")}.` : ""}`);
      lines.push("Where something already in the photo is in front of a new fence, wall or hedge, keep that thing exactly as it is and continue the new item behind it. Never delete a car or anything else to make room.");
    } else {
      lines.push("Only change the areas covered by the marks (and the space directly above tall items). Leave every other pixel exactly as it is.");
    }
    lines.push("Do not draw any colored lines, outlines, dots, numbers or marks from the second image in the result. The finished item is real material, not a flat colored overlay.");
  }
  lines.push("");
  lines.push("Must stay exactly the same:");
  lines.push("- The camera angle, lens, framing, perspective and image size.");
  lines.push("- Existing room or yard dimensions, walls, floor and ceiling lines except the specific surface or opening explicitly requested to change. Preserve the horizon, lighting direction and time of day unless a lighting change was requested.");
  if (kept.length) lines.push(`- These features, in the same place and size: ${kept.join(", ")}.`);
  lines.push("- Anything not part of the requested change.");
  lines.push("");
  lines.push("Use plausible materials and proportions, with correct perspective, shadows, reflections and contact with the supporting surface. This is a visual concept, not proof of structural feasibility or exact dimensions. Do not add text, watermarks, people or pets; preserve any already present outside the requested change.");
  lines.push("For a follow-up edit, retain the current design's placement, material, shape and surrounding features unless that attribute is explicitly being changed. Do not redesign the entire scene for a small correction.");
  lines.push("For overhead structures, show a coherent roof or slat plane and supports meeting the intended floor, patio or ground. Preserve door and window openings. For kitchens and seating, keep appliances and furniture distinct, plausibly scaled, and oriented for use. For removal, reconstruct the exposed background naturally without changing adjacent surfaces.");
  if (input.retryFeedback?.length) {
    lines.push("");
    lines.push(`A previous attempt was rejected for these problems; fix them: ${input.retryFeedback.join(" ")}`);
  }
  return lines.join("\n");
}
