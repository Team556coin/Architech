#!/usr/bin/env node
// `yarn android:apk`: builds a signed APK you can sideload onto your phone. It ends up in release/.
//   --url <server>   what the app opens (default: this computer on your Wi-Fi, port 3000), e.g. https://homeredo.fly.dev
//   --install        also install it on a phone plugged in over USB (USB debugging on)
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { apkName, isLocalServer, sideloadSteps, versionCodeAt } from "../apps/android/release-info.mjs";
import { serverUrlFor } from "../apps/android/server-url.mjs";
import { buildApk, devices, ensureJdk, installAndLaunch, log, ROOT, sdkRoot, warn } from "./lib/android.mjs";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

async function reachable(serverUrl) {
  try {
    const res = await fetch(`${serverUrl}/api/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  const sdk = sdkRoot();
  if (!sdk) throw new Error("Android SDK not found. Install Android Studio once (it installs the SDK), then run this again.");
  const serverUrl = serverUrlFor({ target: "phone", url: option("--url") ?? process.env.ARCHITECH_SERVER_URL });
  const javaHome = await ensureJdk();
  const versionCode = versionCodeAt();

  log("Building the release APK (the first build takes a few minutes)...");
  const built = await buildApk({ serverUrl, release: true, sdk, javaHome, versionCode });
  const outDir = join(ROOT, "release");
  mkdirSync(outDir, { recursive: true });
  const apkPath = join(outDir, apkName(versionCode));
  copyFileSync(built, apkPath);
  copyFileSync(built, join(outDir, "HomeRedo.apk"));

  if (flag("--install")) {
    const phone = devices(sdk).find((d) => !d.emulator) ?? devices(sdk)[0];
    if (!phone) warn("No phone found over USB. Turn on USB debugging (Settings > Developer options), plug it in, and allow this computer.");
    else installAndLaunch(sdk, phone.serial, apkPath);
  }

  console.log("");
  for (const line of sideloadSteps({ serverUrl, apkPath })) console.log(line);
  if (isLocalServer(serverUrl) && !(await reachable(serverUrl))) {
    console.log("");
    warn(`Nothing answers at ${serverUrl} right now. Start it with \`yarn dev\` before opening the app.`);
  }
}

main().catch((e) => {
  console.error(`\x1b[31m[android]\x1b[0m ${e.message}`);
  process.exit(1);
});
