/** True for loopback and private-network hosts (emulator 10.0.2.2, phones on the home Wi-Fi). */
export function isPrivateHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "[::1]" || hostname === "::1") return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

export function trustedOriginsFor(opts: { appUrl: string; extra: string; production: boolean; requestOrigin: string | null }): string[] {
  const list = [new URL(opts.appUrl).origin, ...opts.extra.split(",").map((s) => s.trim()).filter(Boolean)];
  if (!opts.production && opts.requestOrigin) {
    try {
      const u = new URL(opts.requestOrigin);
      if ((u.protocol === "http:" || u.protocol === "https:") && isPrivateHost(u.hostname)) list.push(u.origin);
    } catch {
      // not a URL; ignore
    }
  }
  return [...new Set(list)];
}
