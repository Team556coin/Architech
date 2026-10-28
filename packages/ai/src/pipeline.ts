import { describeDesign, getItem, MAX_AUTO_RETRIES, type Calibration, type Drawing, type EditRequest, type KeepItem, type Point, type SpaceType } from "@architech/core";
import { pickAspectRatio, pixelLock, renderGuide, renderMask, stretchToRatio } from "@architech/imaging";
import { buildGroundModel, measureDrawing, standingTops, type ItemMeasure } from "@architech/measure";
import sharp from "sharp";
import { rewriteProblem } from "./agents";
import { buildEditPrompt, describeDrawingForPrompt } from "./prompt";

export type EditStage = "understanding" | "planning" | "painting" | "checking" | "retrying" | "done";

export interface PlanResult {
  allowed: boolean;
  refusal: string | null;
  reply: string;
  editPrompt: string;
  followUps: string[];
  /** Enables placement checks for quick chat-only additions too. */
  standing?: boolean;
}

export interface PlanArgs {
  contextPhotos?: Buffer[];
  base: Buffer;
  guide: Buffer | null;
  message: string;
  drawingNotes: string[];
  keep: KeepItem[];
  spaceType: SpaceType;
  history: { role: "user" | "assistant"; content: string }[];
}

export interface VerifyArgs {
  before: Buffer;
  after: Buffer;
  guide: Buffer | null;
  keep: KeepItem[];
  drawingNotes: string[];
  plan: string;
  /** The edit adds a fence, wall or other item that stands on the ground. */
  standing: boolean;
}

export interface VerifyResult {
  pass: boolean;
  problems: string[];
}

export interface EditDeps {
  plan(args: PlanArgs): Promise<PlanResult>;
  edit(args: { prompt: string; images: Buffer[]; aspectRatio: string }): Promise<Buffer>;
  verify(args: VerifyArgs): Promise<VerifyResult>;
  /** Objects already in front of a new fence, wall or hedge. Optional; a failure is ignored. */
  occlude?(args: { base: Buffer; guide: Buffer; message?: string; drawingNotes?: string[] }): Promise<{ label: string; points: Point[] }[]>;
}

export interface EditInput {
  base: Buffer;
  request: EditRequest;
  spaceType: SpaceType;
  calibration: Calibration | null;
  history: { role: "user" | "assistant"; content: string }[];
  /** Close-ups of boards or finishes, one per drawing that has a preset or an uploaded photo. */
  samples?: { drawingId: string; image: Buffer }[];
}

export interface EditOutput {
  image: Buffer;
  width: number;
  height: number;
  reply: string;
  followUps: string[];
  prompt: string;
  attempts: number;
  verified: boolean;
  problems: string[];
}

export class RefusedError extends Error {}

function sceneFor(drawings: Drawing[], cal: Calibration | null): { measures: Record<string, ItemMeasure | undefined>; tops: Record<string, number[]> } {
  const model = cal ? buildGroundModel(cal) : null;
  const measures: Record<string, ItemMeasure | undefined> = {};
  const tops: Record<string, number[]> = {};
  for (const d of drawings) {
    measures[d.id] = measureDrawing(d, model) ?? undefined;
    const top = standingTops(d, model);
    if (top) tops[d.id] = top;
  }
  return { measures, tops };
}

const isStanding = (d: Drawing) => getItem(d.itemType).tall && d.zoneHeight > 0 && d.kind !== "brush";

export async function runEdit(deps: EditDeps, input: EditInput, onStage: (s: EditStage) => void = () => {}): Promise<EditOutput> {
  onStage("understanding");
  if (input.request.basePhoto) {
    input = { ...input, base: await sharp(Buffer.from(input.request.basePhoto.dataUrl.split(",")[1]!, "base64")).resize({ width: 1536, height: 1536, fit: "inside", withoutEnlargement: true }).jpeg().toBuffer(), calibration: null };
  }
  const meta = await sharp(input.base).metadata();
  const W = meta.width!;
  const H = meta.height!;
  const { drawings, keep, message } = input.request;
  const contextPhotos = await Promise.all((input.request.contextPhotos ?? []).map(async (p) => sharp(Buffer.from(p.dataUrl.split(",")[1]!, "base64")).resize({ width: 1000, height: 1000, fit: "inside", withoutEnlargement: true }).jpeg().toBuffer()));
  const units = input.calibration?.units ?? "imperial";
  const { measures, tops } = sceneFor(drawings, input.calibration);
  let sampleNumber = drawings.length ? 2 : 1;
  const samples = (input.samples ?? []).map((s) => ({ drawingId: s.drawingId, image: s.image, imageNumber: ++sampleNumber }));
  const drawingNotes = drawings.map((d) => describeDrawingForPrompt(d, measures[d.id], units, samples.find((s) => s.drawingId === d.id)?.imageNumber));
  if (input.request.design) drawingNotes.push(describeDesign(input.request.design));
  let standing = drawings.some(isStanding);
  const guide = drawings.length ? await renderGuide(input.base, drawings, { tops }) : null;

  onStage("planning");
  const plan = await deps.plan({ base: input.base, guide, message, drawingNotes, keep, contextPhotos, spaceType: input.spaceType, history: input.history.slice(-8) });
  if (!plan.allowed) throw new RefusedError(plan.refusal || "I can only help with home and yard design.");
  standing ||= plan.standing === true;

  let occluders: Point[][] = [];
  if (standing && guide && deps.occlude) {
    try {
      occluders = (await deps.occlude({ base: input.base, guide, message, drawingNotes })).map((o) => o.points);
    } catch (e) {
      console.warn("[edit] could not find objects in front of the new structure", e);
    }
  }
  const mask = drawings.length ? await renderMask(drawings, W, H, { tops, occluders }) : null;

  const ratio = pickAspectRatio(W, H);
  const sendBase = await stretchToRatio(input.base, ratio);
  const sendGuide = guide ? await stretchToRatio(guide, ratio) : null;

  let feedback: string[] = [];
  let last: { image: Buffer; prompt: string; problems: string[] } | null = null;
  for (let attempt = 1; attempt <= MAX_AUTO_RETRIES + 1; attempt++) {
    onStage(attempt === 1 ? "painting" : "retrying");
    const prompt = buildEditPrompt({
      plan: input.request.design ? `${plan.editPrompt}\n\nAuthoritative saved design:\n${describeDesign(input.request.design)}` : plan.editPrompt,
      keep,
      drawings,
      measures,
      units,
      hasGuide: !!guide,
      samples: samples.map((s) => ({ drawingId: s.drawingId, imageNumber: s.imageNumber })),
      retryFeedback: feedback,
    });
    const raw = await deps.edit({ prompt, images: [...(sendGuide ? [sendBase, sendGuide] : [sendBase]), ...samples.map((s) => s.image)], aspectRatio: ratio });
    const image = mask
      ? await pixelLock(input.base, raw, mask)
      : await sharp(raw).resize(W, H, { fit: "fill" }).removeAlpha().jpeg({ quality: 93 }).toBuffer();

    onStage("checking");
    let verdict: VerifyResult;
    try {
      verdict = await deps.verify({ before: input.base, after: image, guide, keep, drawingNotes, plan: plan.editPrompt, standing });
    } catch {
      onStage("done");
      return { image, width: W, height: H, reply: plan.reply, followUps: plan.followUps, prompt, attempts: attempt, verified: false, problems: [] };
    }
    if (verdict.pass) {
      onStage("done");
      return { image, width: W, height: H, reply: plan.reply, followUps: plan.followUps, prompt, attempts: attempt, verified: true, problems: [] };
    }
    feedback = verdict.problems.map(rewriteProblem);
    last = { image, prompt, problems: feedback };
  }
  onStage("done");
  return {
    image: last!.image,
    width: W,
    height: H,
    reply: plan.reply,
    followUps: plan.followUps,
    prompt: last!.prompt,
    attempts: MAX_AUTO_RETRIES + 1,
    verified: false,
    problems: last!.problems,
  };
}
