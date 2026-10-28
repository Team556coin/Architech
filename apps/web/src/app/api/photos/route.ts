import { randomUUID } from "node:crypto";
import type { SpaceAnalysis } from "@architech/ai";
import { prepareUpload } from "@architech/imaging";
import { ai } from "@/server/ai";
import { json, readImageFile, requireUser, route } from "@/server/http";
import { allow } from "@/server/limiter";
import { fileUrl, keys, putObject } from "@/server/storage";

export const dynamic = "force-dynamic";

/**
 * Takes a new photo: straightens and resizes it, keeps it as a short-lived file,
 * and (unless analyze=false) asks the AI what it sees.
 */
export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  allow(`photo:${user.id}`, 20, 60_000);
  const { bytes, form } = await readImageFile(req);
  const prepared = await prepareUpload(bytes);
  const f35 = Number(form.get("focal35"));
  if (!prepared.focalPx && Number.isFinite(f35) && f35 > 8 && f35 < 400) prepared.focalPx = (f35 * Math.max(prepared.width, prepared.height)) / 36;
  const key = keys.tmp(user.id, randomUUID());
  await putObject(key, prepared.buffer);
  let analysis: SpaceAnalysis | null = null;
  let analysisError: string | null = null;
  if (form.get("analyze") !== "false") {
    try {
      analysis = await ai().analyze(prepared.buffer);
    } catch (e) {
      console.error("[photos] analysis failed", e);
      analysisError = "We couldn't look at this photo closely, but you can still design.";
    }
  }
  return json({ key, url: fileUrl(key), width: prepared.width, height: prepared.height, focalPx: prepared.focalPx ?? null, analysis, analysisError }, 201);
});
