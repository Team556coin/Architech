import { randomUUID } from "node:crypto";
import { CATALOG, designAlternativeSchema } from "@architech/core";
import { OpenRouter, toDataUrl, designResponseSchema, decodeDesignResponse } from "@architech/ai";
import { z } from "zod";
import { env } from "@/server/env";
import { HttpError, json, readJson, requireUser, route } from "@/server/http";
import { allow } from "@/server/limiter";
import { getObject, keys } from "@/server/storage";

const input = z.object({ design: designAlternativeSchema, message: z.string().trim().min(1).max(2000), selectedId: z.string().max(80).nullable(), photoKeys: z.array(z.string().max(500)).max(2).optional() });

export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  allow(`design:${user.id}`, 10, 60_000);
  const body = await readJson(req, (v) => input.parse(v));
  const images = [];
  for (const key of body.photoKeys ?? []) {
    if (!keys.ownedBy(key, user.id)) throw new HttpError(400, "That reference photo is not yours.", "invalid");
    images.push(toDataUrl(await getObject(key)));
  }
  const e = env();
  if (e.AI_PROVIDER === "mock") return json({ design: body.design, reply: "Mock AI leaves the plan unchanged. Use the item controls to edit it." });
  if (!e.OPENROUTER_API_KEY) throw new HttpError(503, "AI is unavailable. You can still use every manual planning control.", "ai_not_configured");
  const or = new OpenRouter({ apiKey: e.OPENROUTER_API_KEY, appUrl: e.APP_URL });
  const result = decodeDesignResponse(await or.chatJson({ model: e.AI_VISION_MODEL, schemaName: "design_update", schema: designResponseSchema, images,
    system: `You edit a home project's structured design. Return item options as an array of {key, value} entries, retaining each supplied option. Return the complete item list after ONLY the requested changes, preserving IDs and unrelated fields. Coordinates and dimensions are METERS, regardless of display units. Convert feet/inches correctly. SelectedId resolves "it". If ambiguous, leave items unchanged and ask one short question in reply. Never modify or remove locked items; explain that they need unlocking. Preserve prices; do not invent prices. Do not invent measurements or claim structural feasibility. New dimensions are desired or estimated, never measured. For path items, points are local offsets from their center, width is channel width, and closed closes the loop. For a patio cover, its roof and supports are one item. Groups identify related items; move group members only if asked to move the group. Available types: ${CATALOG.map((i) => `${i.id} (${i.label})`).join(", ")}. Use other for custom requests. New IDs may be arbitrary unique strings. With two photos, image 1 is original and image 2 is the selected preview: extract the changed/new design features, not the entire existing property. Photo-derived placement and dimensions are approximate; say so. Keep the quick design intent while producing editable objects.`,
    text: JSON.stringify({ selectedId: body.selectedId, request: body.message, design: body.design }),
  }));
  for (const locked of body.design.items.filter((i) => i.locked)) {
    if (JSON.stringify(result.items.find((i) => i.id === locked.id)) !== JSON.stringify(locked)) throw new HttpError(422, `The proposed edit changes locked item ${locked.name}. Unlock it or refine the request.`, "locked_item");
  }
  const items = result.items.map((i) => {
    const previous = body.design.items.find((old) => old.id === i.id);
    if (previous?.locked) return previous;
    const dimensionChanged = previous && ["width", "depth", "height"].some((k) => previous[k as "width"] !== i[k as "width"]);
    return { ...i, id: previous?.id ?? randomUUID(), source: images.length ? "estimated" as const : dimensionChanged || !previous ? "desired" as const : previous.source,
      unitCost: previous?.unitCost ?? null, laborCost: previous?.laborCost ?? 0 };
  });
  const design = designAlternativeSchema.parse({ ...body.design, items, revision: body.design.revision + 1, ...(images.length ? { photoAligned: false } : {}) });
  return json({ design, reply: result.reply });
});
