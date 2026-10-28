import { SPACE_TYPES, type Point, type SpaceType } from "@architech/core";
import { polygonArea } from "@architech/measure";
import { z } from "zod";
import { OpenRouter, toDataUrl } from "./openrouter";
import type { EditDeps, PlanArgs, PlanResult, VerifyArgs, VerifyResult } from "./pipeline";

export interface AiModels {
  vision: string;
  image: string;
}

export const DEFAULT_MODELS: AiModels = {
  vision: "google/gemini-4-argon",
  image: "openai/gpt-image-2.5-sunburst",
};

const analysisSchema = z.object({
  spaceType: z.enum(SPACE_TYPES),
  title: z.string(),
  summary: z.string(),
  keep: z.array(z.object({ id: z.string(), label: z.string() })),
  suggestions: z.array(z.object({ label: z.string(), prompt: z.string() })),
  horizonY: z.number().nullable(),
  references: z.array(
    z.object({
      label: z.string(),
      kind: z.enum(["vertical", "ground"]),
      ax: z.number(),
      ay: z.number(),
      bx: z.number(),
      by: z.number(),
      lengthM: z.number(),
    }),
  ),
});

export interface SpaceAnalysis {
  spaceType: SpaceType;
  title: string;
  summary: string;
  keep: { id: string; label: string; keep: boolean }[];
  suggestions: { label: string; prompt: string }[];
  horizonY: number | null;
  references: { id: string; label: string; kind: "vertical" | "ground"; a: { x: number; y: number }; b: { x: number; y: number }; lengthM: number; source: "estimated" }[];
}

const ANALYZE_SYSTEM = `You are Architech's home design assistant. You look at a homeowner's photo of a room or yard.
Return:
- spaceType: the best match.
- title: a short friendly project name like "My Bathroom" or "Backyard".
- summary: one short sentence describing what you see.
- keep: 3 to 8 fixed structural features that a remodel should keep by default (windows, doors, ceiling, walls, stairs, plumbing location like "Tub location", the house, the shed, trees, the fence line). Short labels, ids in kebab-case.
- suggestions: exactly 6 distinct remodel ideas grounded in THIS photo. Inspect visible surfaces, open areas and access before choosing them. Use short action labels (e.g. "Cover this patio", "Add grill area", "Outdoor seating") and a self-contained prompt identifying placement and what to preserve. Outdoors consider cooking, dining, seating, shade, play, landscaping and water features, selecting ideas that plausibly suit the visible space. Include a coordinated complete design when appropriate without crowding the space. Indoor ideas should fit the actual room. These are visual ideas, not verified fit or construction advice. Never infer property boundaries, utilities, structural capacity or exact dimensions from appearance.
- horizonY: the image row (0 = top edge, 1 = bottom edge) of eye level, where lines parallel to the floor or ground converge. Can be below 0 or above 1 if the camera is tilted a lot. null if you cannot tell.
- references: up to 3 objects of well-known real size that are fully visible and whose bottom touches the floor or ground, with endpoint coordinates normalized 0..1 (x from left, y from top). Use kind "vertical" with (ax, ay) at the bottom where it touches the floor and (bx, by) at the top, or kind "ground" for a horizontal length lying on the floor/ground with both ends on it. Standard sizes: interior or exterior door 2.03 m tall; kitchen counter 0.91 m tall; bathroom vanity 0.81 m tall; toilet seat 0.41 m tall; single garage door 2.13 m tall; standard privacy fence 1.83 m tall. Only include references you can locate precisely. Return an empty list if none.`;

export async function analyzeSpace(or: OpenRouter, models: AiModels, photo: Buffer): Promise<SpaceAnalysis> {
  const r = await or.chatJson({
    model: models.vision,
    system: ANALYZE_SYSTEM,
    text: "Analyze this photo.",
    images: [toDataUrl(photo)],
    schemaName: "space_analysis",
    schema: analysisSchema,
  });
  return normalizeAnalysis(r);
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const kebab = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "item";

export function normalizeAnalysis(r: z.infer<typeof analysisSchema>): SpaceAnalysis {
  const seen = new Set<string>();
  const keep = r.keep
    .filter((k) => k.label.trim())
    .slice(0, 8)
    .map((k) => {
      let id = kebab(k.id || k.label);
      while (seen.has(id)) id += "-2";
      seen.add(id);
      return { id, label: k.label.trim().slice(0, 40), keep: true };
    });
  const references = r.references
    .filter((ref) => ref.lengthM > 0.1 && ref.lengthM < 20)
    .map((ref, i) => ({
      id: `est-${i + 1}`,
      label: ref.label.slice(0, 40),
      kind: ref.kind,
      a: { x: clamp(ref.ax), y: clamp(ref.ay) },
      b: { x: clamp(ref.bx), y: clamp(ref.by) },
      lengthM: ref.lengthM,
      source: "estimated" as const,
    }))
    .filter((ref) => Math.hypot(ref.a.x - ref.b.x, ref.a.y - ref.b.y) > 0.02)
    .slice(0, 3);
  return {
    spaceType: r.spaceType,
    title: r.title.trim().slice(0, 40) || "My Project",
    summary: r.summary.trim().slice(0, 200),
    keep,
    suggestions: r.suggestions.filter((s) => s.label.trim() && s.prompt.trim()).slice(0, 6).map((s) => ({ label: s.label.trim().slice(0, 28), prompt: s.prompt.trim().slice(0, 300) })),
    horizonY: r.horizonY === null ? null : clamp(r.horizonY, -1.5, 2.5),
    references,
  };
}

const planSchema = z.object({
  allowed: z.boolean(),
  refusal: z.string().nullable(),
  reply: z.string(),
  editPrompt: z.string(),
  followUps: z.array(z.string()),
  standing: z.boolean().default(false),
});

const PLAN_SYSTEM = `You are Architech's friendly home design assistant for complete beginners.
The homeowner sent a photo (first image) and possibly a copy with colored placement marks (second image), plus a request in their own words.
Decide:
- standing: true if adding or moving a standing structure or furnishing (fence, patio cover, gazebo, kitchen, seating, play equipment, wall), including requests without drawing marks. This enables visual placement checks. false for surface-only changes or removals.
- allowed: true for any home, room, yard, landscaping, exterior or architecture design change. false for anything else, for requests to add or change people, or anything harmful or explicit.
- refusal: if not allowed, one kind sentence explaining what you can help with; otherwise null.
- reply: 1-2 short, warm sentences in plain words confirming what you'll do and what you're keeping (e.g. "Love it! Keeping your window and layout, swapping in a glass walk-in shower and warm lighting.").
- editPrompt: a precise, detailed instruction for a photo editing model: exact materials, colors, finishes, styles and products, where things go (refer to the marks by number and color when present), and what must not change. Never ask the editor to change the camera, room shape, or kept features.
- followUps: exactly 3 short, actionable instructions tailored to the actual change, like "Darken the fence", "Add a gate", "Widen the patio". Name the target where possible so each instruction works independently.
For a quick preview, never require measurements or a questionnaire. If the request is vague, choose a restrained, plausible concept appropriate to the visible space. Honor custom home projects even when they are not catalog items: outdoor kitchens, grill areas, bars, dining, seating, covered patios, gazebos, play structures, lazy rivers and interior changes. For coordinated designs, arrange distinct useful zones with visible circulation. Explain important visual assumptions briefly in reply without claiming verified fit, structural feasibility, or construction approval.
For follow-up requests, edit the selected photo as the current design; preserve earlier choices except attributes the homeowner explicitly changes. Resolve references such as "it" from the supplied photo, marks and history. Keep explicitly locked features. If removal conflicts with a kept feature, explain that the homeowner needs to uncheck it under Choose what stays rather than silently removing it.
For patio covers and gazebos, specify roof geometry, plausible support placement and the supporting ground or patio. For kitchens and grill areas, specify appliance orientation, preparation surfaces and accessible seating without inventing utility connections. For lazy rivers, follow the channel shape and preserve the island; do not turn the loop into a filled swimming pool. For wall removals, limit the concept to the targeted wall or opening and preserve adjacent features.
When a mark is a fence, wall, hedge or other standing item, the editPrompt must say: its base is planted in the ground on the bottom edge of the colored shape; its top matches the top edge, which is the requested height on the available photo scale; anything already in front of it, including a car, stays completely unchanged and the new item continues behind it. Never tell the editor to remove a car, person or other object to make room for the item.
When the notes say to match the fence already in the photo, or to copy boards from a sample image, the editPrompt must say to copy those exact boards, color, gaps and finish.`;

export function createPlanner(or: OpenRouter, models: AiModels) {
  return async (a: PlanArgs): Promise<PlanResult> => {
    const kept = a.keep.filter((k) => k.keep).map((k) => k.label);
    const unlocked = a.keep.filter((k) => !k.keep).map((k) => k.label);
    const history = a.history.map((h) => `${h.role === "user" ? "Homeowner" : "You"}: ${h.content}`).join("\n");
    const text = [
      `Space: ${a.spaceType}.`,
      a.contextPhotos?.length ? `The final ${a.contextPhotos.length} images are unaligned context photos from other angles. Use them for context only; never change the first image camera or infer exact hidden geometry.` : "",
      `Request: ${a.message.trim() || "(no words; use the marks)"}`,
      a.drawingNotes.length ? `Placement marks:\n${a.drawingNotes.join("\n")}` : "No placement marks; the change can apply to the whole photo.",
      kept.length ? `Keep: ${kept.join(", ")}.` : "",
      unlocked.length ? `The homeowner allows changing: ${unlocked.join(", ")}.` : "",
      history ? `Earlier in this project:\n${history}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const r = await or.chatJson({
      model: models.vision,
      system: PLAN_SYSTEM,
      text,
      images: [toDataUrl(a.base), ...(a.guide ? [toDataUrl(a.guide)] : []), ...(a.contextPhotos ?? []).map(toDataUrl)],
      schemaName: "edit_plan",
      schema: planSchema,
      temperature: 0.4,
    });
    return { ...r, followUps: r.followUps.slice(0, 3).map((f) => f.slice(0, 32)) };
  };
}

const verifySchema = z.object({
  kept: z.array(z.object({ label: z.string(), ok: z.boolean() })),
  changeDone: z.boolean(),
  marksVisible: z.boolean(),
  itemsFollowMarks: z.boolean(),
  grounded: z.boolean(),
  passesBehind: z.boolean(),
  heightOk: z.boolean(),
  realistic: z.boolean(),
  problems: z.array(z.string()),
});

const VERIFY_SYSTEM = `You check AI photo edits for a home design app. Image 1 is BEFORE, image 2 is AFTER, and image 3 (if present) shows the homeowner's placement marks on the BEFORE photo.
Be strict about structure, height and placement, lenient about style.
- kept: for each listed feature, ok = it is still present in AFTER in the same place and roughly the same size (it may be restyled only if the request asked).
- changeDone: the requested change is clearly visible. If the notes say to match the fence already in the photo, or to copy boards from a sample, the new fence must use that same board pattern, color and spacing; a different style means this is false.
- marksVisible: any colored guide lines, outlines, dots or numbers from the marks appear in AFTER.
- itemsFollowMarks: each new item sits where its mark was (true if there were no marks). For a fence, wall or hedge, the base follows the bottom edge of the colored shape, including where that edge passes behind a car.
- grounded: every new fence, wall or other standing item has its base on the ground or floor, on the mark, touching it. False if it floats, or if it rests on a car or unrelated object; an intended patio, deck or floor is a valid supporting surface. True when the edit adds nothing that stands up.
- passesBehind: objects closer to the camera than a new standing item are still fully there, and the new item is hidden behind them. False if a fence sits on a car, cuts through it, or the car (or anything else in front) was removed or partly erased. True when nothing is in front.
- heightOk: standing items match stated dimensions and guide height when supplied. Without dimensions or a guide, check plausible proportions against the visible scene, without inventing exact measurements. False if obviously short or tall. True when nothing stands up.
- realistic: AFTER looks like a real photo (no warped geometry, melted objects, floating items).
- problems: short sentences describing each failure, written as instructions to fix (e.g. "Keep the window on the back wall."). Empty if everything is fine. Never tell the editor to remove an object the homeowner did not ask to remove. If a fence sits on a car, the fix is "Keep the car and run the fence behind it, with the fence base on the ground."`;

export function createVerifier(or: OpenRouter, models: AiModels) {
  return async (a: VerifyArgs): Promise<VerifyResult> => {
    const kept = a.keep.filter((k) => k.keep).map((k) => k.label);
    const r = await or.chatJson({
      model: models.vision,
      system: VERIFY_SYSTEM,
      text: [
        `Requested change: ${a.plan}`,
        a.drawingNotes.length ? `Marks:\n${a.drawingNotes.join("\n")}` : "",
        `Features to keep: ${kept.join(", ") || "none listed"}.`,
        a.standing ? "This edit adds a standing structure. Check its base, its height and whatever sits in front of it." : "This edit adds nothing that stands up. Set grounded, passesBehind and heightOk to true.",
      ]
        .filter(Boolean)
        .join("\n\n"),
      images: [toDataUrl(a.before), toDataUrl(a.after), ...(a.guide ? [toDataUrl(a.guide)] : [])],
      schemaName: "edit_check",
      schema: verifySchema,
      temperature: 0,
    });
    return judge(r, kept, a.standing);
  };
}

/** Turns "delete the car" into "keep the car and run the fence behind it". Leaves real removal requests alone. */
export function rewriteProblem(problem: string): string {
  const instead = problem.match(/\b(?:remove|delete|erase) the ([a-z0-9][a-z0-9' -]{0,40}?)(?:\s+completely)?\s+instead\b/i);
  const foreground = problem.match(/\b(?:remove|delete|erase) the ((?:[a-z]+ ){0,3}?(?:car|truck|vehicle|suv|van|trailer|automobile|person|bicycle|bike|bin|wheelbarrow))\b(?:\s+completely)?/i);
  const thing = (instead?.[1] ?? foreground?.[1])?.trim();
  if (!thing || /^(fence|wall|hedge|mark|guide|line|new|colored)\b/i.test(thing)) return problem;
  return `Keep the ${thing} fully visible and unchanged. Run the new structure behind it, with its base on the ground, not resting on it.`;
}

export function judge(r: z.infer<typeof verifySchema>, keptLabels: string[], standing = false): VerifyResult {
  const problems = r.problems.map(rewriteProblem);
  const missing = r.kept.filter((k) => !k.ok && keptLabels.some((l) => l.toLowerCase() === k.label.toLowerCase()));
  for (const m of missing) if (!problems.some((p) => p.toLowerCase().includes(m.label.toLowerCase()))) problems.push(`Keep the ${m.label.toLowerCase()} exactly where it was.`);
  if (r.marksVisible && !problems.some((p) => /mark|line|outline/i.test(p))) problems.push("Remove every colored guide mark; none may appear in the photo.");
  if (!r.itemsFollowMarks && !problems.some((p) => /mark|where/i.test(p))) problems.push("Place each new item exactly on its mark.");
  if (standing && !r.grounded && !problems.some((p) => /ground|float|base/i.test(p))) problems.push("Put the base on the ground, on its mark, touching the soil or floor. Do not rest it on a car or anything else.");
  if (standing && !r.passesBehind && !problems.some((p) => /behind/i.test(p))) problems.push("Keep every object in front of the new structure, and run the structure behind it instead of on top of it.");
  if (standing && !r.heightOk && !problems.some((p) => /height|tall|\bft\b/i.test(p))) problems.push("Match the true height: the top of the item must meet the top of its guide.");
  if (!r.changeDone && !problems.length) problems.push("Make the requested change clearly visible.");
  if (!r.realistic && !problems.some((p) => /real/i.test(p))) problems.push("Make it look like a real photo with correct perspective.");
  const placementOk = !standing || (r.grounded && r.passesBehind && r.heightOk);
  const pass = missing.length === 0 && !r.marksVisible && r.itemsFollowMarks && r.changeDone && r.realistic && placementOk;
  return { pass, problems: pass ? [] : problems };
}

const occluderSchema = z.object({
  occluders: z.array(z.object({ label: z.string(), points: z.array(z.object({ x: z.number(), y: z.number() })) })),
});

const OCCLUDE_SYSTEM = `You look at a homeowner's photo (first image) and the same photo with a colored guide (second image). The colored shape is where a new structure or furnishing will stand. Its bottom edge is on the ground.
Return occluders: objects already in the photo that are closer to the camera than that structure and overlap it, so the structure must pass behind them. Include vehicles, people, bins, furniture and anything else in front.
For each, label is a short name ("black car") and points is a tight polygon around the object's visible silhouette, normalized 0 to 1 (x from the left, y from the top). Use at least 6 points and follow the outline, including the roofline and wheels. Do not include empty space around the object. Only preserve existing foreground objects; exclude the support surface and anything the placement marks explicitly replace.
Do not include the ground, the sky, trees or buildings behind the line, or the new structure itself. Return an empty list when nothing is in front.`;

function downsample(points: Point[], max: number): Point[] {
  if (points.length <= max) return points;
  const out: Point[] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round((i * (points.length - 1)) / (max - 1))]!);
  return out;
}

/** Drops silhouettes that are too small, too big, or too rough to trust. */
export function normalizeOccluders(raw: { label: string; points: { x: number; y: number }[] }[]): { label: string; points: Point[] }[] {
  const out: { label: string; points: Point[] }[] = [];
  for (const o of raw) {
    const points: Point[] = [];
    for (const p of o.points) {
      const q = { x: clamp(p.x), y: clamp(p.y) };
      const prev = points[points.length - 1];
      if (prev && Math.hypot(prev.x - q.x, prev.y - q.y) < 0.01) continue;
      points.push(q);
    }
    if (points.length >= 2 && Math.hypot(points[0]!.x - points[points.length - 1]!.x, points[0]!.y - points[points.length - 1]!.y) < 0.01) points.pop();
    const sampled = downsample(points, 24);
    if (sampled.length < 4) continue;
    const area = polygonArea(sampled);
    if (area < 0.004 || area > 0.45) continue;
    out.push({ label: o.label.trim().slice(0, 40) || "object", points: sampled });
    if (out.length === 4) break;
  }
  return out;
}

export function createOccluder(or: OpenRouter, models: AiModels) {
  return async (a: { base: Buffer; guide: Buffer; message?: string; drawingNotes?: string[] }) => {
    const r = await or.chatJson({
      model: models.vision,
      system: OCCLUDE_SYSTEM,
      text: [
        "Which objects are in front of the new structure and must stay in front of it? Exclude objects explicitly requested to be removed or replaced.",
        a.message ? `Homeowner request: ${a.message}` : "",
        ...(a.drawingNotes ?? []),
      ].filter(Boolean).join("\n"),
      images: [toDataUrl(a.base), toDataUrl(a.guide)],
      schemaName: "occluders",
      schema: occluderSchema,
      temperature: 0,
    });
    return normalizeOccluders(r.occluders);
  };
}

export function createOpenRouterDeps(or: OpenRouter, models: AiModels, user?: string): EditDeps {
  return {
    plan: createPlanner(or, models),
    verify: createVerifier(or, models),
    occlude: createOccluder(or, models),
    edit: async ({ prompt, images, aspectRatio }) => {
      const r = await or.generateImage({ model: models.image, prompt, images, aspectRatio, quality: "high", user });
      return r.image;
    },
  };
}
