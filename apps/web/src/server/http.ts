import { OutOfCreditsError, ProjectLimitError, RateLimitError, RetryNotAllowedError } from "@architech/db";
import { NotAnImageError } from "@architech/imaging";
import { ZodError } from "zod";
import { auth } from "./auth";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "error",
  ) {
    super(message);
  }
}

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status);
  if (e instanceof ProjectLimitError) return json({ error: e.message, code: "project_limit" }, 409);
  if (e instanceof OutOfCreditsError) return json({ error: e.message, code: "out_of_credits" }, 402);
  if (e instanceof RateLimitError) return json({ error: e.message, code: "rate_limited" }, 429);
  if (e instanceof RetryNotAllowedError) return json({ error: e.message, code: "retry_used" }, 409);
  if (e instanceof NotAnImageError) return json({ error: e.message, code: "not_an_image" }, 415);
  if (e instanceof ZodError) return json({ error: "Something in that request wasn't right.", code: "invalid", issues: e.issues.slice(0, 5) }, 400);
  console.error("[api]", e);
  return json({ error: "Something went wrong on our side. Please try again.", code: "server_error" }, 500);
}

/** Wraps a route handler with consistent error responses. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export async function getUser(req: Request): Promise<SessionUser | null> {
  const session = await auth().api.getSession({ headers: req.headers });
  if (!session) return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email };
}

export async function requireUser(req: Request): Promise<SessionUser> {
  const u = await getUser(req);
  if (!u) throw new HttpError(401, "Please sign in first.", "unauthorized");
  return u;
}

export async function readJson<T>(req: Request, parse: (v: unknown) => T): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Something in that request wasn't right.", "invalid");
  }
  return parse(body);
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function readImageFile(req: Request, field = "photo"): Promise<{ bytes: Buffer; form: FormData }> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_UPLOAD_BYTES + 1024 * 1024) throw new HttpError(413, "That photo is too big. Try one under 25 MB.", "too_big");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "Please choose a photo.", "invalid");
  }
  const file = form.get(field);
  if (!(file instanceof Blob) || file.size === 0) throw new HttpError(400, "Please choose a photo.", "invalid");
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "That photo is too big. Try one under 25 MB.", "too_big");
  return { bytes: Buffer.from(await file.arrayBuffer()), form };
}
