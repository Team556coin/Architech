import { registerPlugin } from "@capacitor/core";
import { isNative } from "./native";

const BrowserAuth = registerPlugin<{ open(options: { url: string }): Promise<void> }>("BrowserAuth");
const PENDING = "homeredo-google-sign-in";
const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export async function startNativeGoogle(next: string): Promise<void> {
  const verifier = hex(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  sessionStorage.setItem(PENDING, JSON.stringify({ verifier, next, created: Date.now() }));
  try {
    await BrowserAuth.open({ url: `${location.origin}/sign-in?native=${challenge}` });
  } catch (error) {
    sessionStorage.removeItem(PENDING);
    throw error;
  }
}

export async function listenNativeGoogle(): Promise<() => void> {
  if (!isNative()) return () => {};
  const { App } = await import("@capacitor/app");
  let exchanging = false;
  const receive = async (raw: string) => {
    let url: URL;
    try { url = new URL(raw); } catch { return; }
    if (url.protocol !== "app.architech:" || url.hostname !== "auth" || exchanging) return;
    const code = new URLSearchParams(url.hash.slice(1)).get("code");
    const saved = sessionStorage.getItem(PENDING);
    if (!code || !saved) return;
    exchanging = true;
    try {
      const pending = JSON.parse(saved) as { verifier: string; next: string; created: number };
      if (Date.now() - pending.created > 10 * 60_000) throw new Error("Sign-in expired");
      const response = await fetch("/api/auth/native/exchange", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, verifier: pending.verifier }) });
      if (!response.ok) throw new Error("Sign-in failed");
      const next = pending.next;
      location.replace(next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/");
    } catch {
      location.replace("/sign-in?error=google");
    } finally {
      sessionStorage.removeItem(PENDING);
      exchanging = false;
    }
  };
  const listener = await App.addListener("appUrlOpen", ({ url }) => { void receive(url); });
  const launch = await App.getLaunchUrl();
  if (launch?.url) void receive(launch.url);
  return () => { void listener.remove(); };
}
