import { HttpError } from "./http";

const hits = new Map<string, number[]>();

/** Simple in-memory sliding-window limiter for cheap endpoints (one server process). */
export function allow(key: string, max: number, windowMs: number, now = Date.now()) {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) throw new HttpError(429, "Slow down a little and try again in a minute.", "rate_limited");
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  }
}

export function resetLimiter() {
  hits.clear();
}
