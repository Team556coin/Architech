// Works out which Architech server the Android app opens.
import { networkInterfaces } from "node:os";

export const EMULATOR_URL = "http://10.0.2.2:3000";

/** First private IPv4 address of this computer (what a phone on the same Wi-Fi can reach). */
export function lanAddress(interfaces = networkInterfaces()) {
  const candidates = [];
  for (const [name, list] of Object.entries(interfaces)) {
    for (const i of list ?? []) {
      if (i.family !== "IPv4" || i.internal) continue;
      if (!/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address)) continue;
      if (/vEthernet|WSL|Hyper-V|VirtualBox|VMware|docker|br-|veth/i.test(name)) continue;
      candidates.push({ name, address: i.address });
    }
  }
  const pick = candidates.find((c) => c.address.startsWith("192.168.")) ?? candidates[0];
  return pick?.address ?? null;
}

/** Normalizes a URL the person typed ("192.168.1.20:3000", "https://homeredo.fly.dev/"). */
export function normalizeServerUrl(input) {
  let s = String(input ?? "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  const u = new URL(s);
  return `${u.protocol}//${u.host}`;
}

export function serverUrlFor({ target, url, port = 3000, interfaces }) {
  if (url) return normalizeServerUrl(url);
  if (target === "emulator") return EMULATOR_URL;
  const ip = lanAddress(interfaces);
  if (!ip) throw new Error("Couldn't find this computer's Wi-Fi address. Pass --url http://<your-pc-ip>:3000 or your Fly URL.");
  return `http://${ip}:${port}`;
}
