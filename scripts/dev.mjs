#!/usr/bin/env node
// `yarn dev`: starts Postgres + S3 in Docker, the web app on :3000, and the Android app in the emulator.
//   --no-android   web only
//   --mock-ai      use the built-in fake AI (no OpenRouter key needed)
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { adb, buildApk, devices, ensureJdk, installAndLaunch, listAvds, ROOT, sdkRoot, startEmulator, waitForBoot, warn, log as alog } from "./lib/android.mjs";

const args = new Set(process.argv.slice(2));
const withAndroid = !args.has("--no-android");
const WEB = join(ROOT, "apps", "web");
const PORT = 3000;
const log = (m) => console.log(`\x1b[36m[dev]\x1b[0m ${m}`);

function ensureEnvFile() {
  const file = join(WEB, ".env.local");
  if (!existsSync(file)) {
    copyFileSync(join(WEB, ".env.example"), file);
    log("Created apps/web/.env.local - put your OPENROUTER_API_KEY in it.");
  }
  let text = readFileSync(file, "utf8");
  if (/^BETTER_AUTH_SECRET=\s*$/m.test(text)) {
    text = text.replace(/^BETTER_AUTH_SECRET=\s*$/m, `BETTER_AUTH_SECRET=${randomBytes(32).toString("base64url")}`);
    writeFileSync(file, text);
  }
  const key = /^OPENROUTER_API_KEY=(.+)$/m.exec(text)?.[1]?.trim();
  const mock = /^AI_PROVIDER=mock/m.test(text) || args.has("--mock-ai");
  if (!key && !mock) console.log("\x1b[33m[dev]\x1b[0m No OPENROUTER_API_KEY in apps/web/.env.local - edits will be off until you add one (or run `yarn dev --mock-ai`).");
}

function services() {
  log("Starting Postgres and S3 (Docker)...");
  const r = spawnSync("docker", ["compose", "up", "-d", "--wait"], { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) {
    console.error("Docker didn't start. Open Docker Desktop and run `yarn dev` again.");
    process.exit(1);
  }
}

function startWeb() {
  const nextBin = join(createRequire(join(WEB, "package.json")).resolve("next/package.json"), "..", "dist", "bin", "next");
  const env = { ...process.env, S3_CREATE_BUCKET: "true", ...(args.has("--mock-ai") ? { AI_PROVIDER: "mock" } : {}) };
  // Keep Android's WebView on Webpack's stable HMR path during local development.
  const child = spawn(process.execPath, [nextBin, "dev", "--webpack", "--hostname", "0.0.0.0", "--port", String(PORT)], { cwd: WEB, env, stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
  return child;
}

async function waitForWeb(timeoutMs = 180_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(`http://localhost:${PORT}/api/health`, { signal: AbortSignal.timeout(15_000) });
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

async function android() {
  const sdk = sdkRoot();
  if (!sdk) return warn("Android SDK not found (install Android Studio). Skipping the emulator.");
  let target = devices(sdk).find((d) => d.emulator) ?? devices(sdk)[0];
  if (!target) {
    const avds = listAvds(sdk);
    const avd = process.env.ANDROID_AVD ?? (avds.includes("Pixel_7") ? "Pixel_7" : avds[0]);
    if (!avd) return warn("No Android emulator found. Create one in Android Studio (Device Manager), then run `yarn dev` again.");
    alog(`Starting the ${avd} emulator...`);
    startEmulator(sdk, avd);
    target = { serial: await waitForBoot(sdk), emulator: true };
  }
  const javaHome = await ensureJdk();
  // Same-origin "localhost" through adb keeps the page a secure context; 10.0.2.2 is the fallback.
  const reversed = adb(sdk, ["-s", target.serial, "reverse", `tcp:${PORT}`, `tcp:${PORT}`]).ok;
  const serverUrl = reversed ? `http://localhost:${PORT}` : `http://10.0.2.2:${PORT}`;
  alog("Building the Android app (the first build takes a few minutes)...");
  const apk = await buildApk({ serverUrl, release: false, sdk, javaHome });
  installAndLaunch(sdk, target.serial, apk);
  alog(`HomeRedo is running on ${target.serial}. The app reloads from your dev server, so web changes show up right away.`);
}

ensureEnvFile();
services();
const web = startWeb();
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => web.kill(sig));

if (withAndroid) {
  const up = await waitForWeb();
  if (!up) warn("The web app didn't answer on :3000 yet - starting Android anyway.");
  else log(`Web app ready: http://localhost:${PORT}`);
  android().catch((e) => warn(`Android setup stopped: ${e.message}`));
}
