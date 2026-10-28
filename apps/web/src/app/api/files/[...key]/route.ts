import { HttpError, requireUser, route } from "@/server/http";
import { getObject, keys, ObjectNotFoundError } from "@/server/storage";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ key: string[] }> };

/** Serves the signed-in user's own pictures from storage (same origin, so the editor canvas can use them). */
export const GET = route(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req);
  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  if (!keys.ownedBy(key, user.id)) throw new HttpError(404, "Not found.", "not_found");
  try {
    const body = await getObject(key);
    const type = key.endsWith(".png") ? "image/png" : "image/jpeg";
    return new Response(new Uint8Array(body), {
      headers: { "Content-Type": type, "Content-Length": String(body.length), "Cache-Control": "private, max-age=31536000, immutable" },
    });
  } catch (e) {
    if (e instanceof ObjectNotFoundError) throw new HttpError(404, "Not found.", "not_found");
    throw e;
  }
});
