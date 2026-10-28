// Android tooling used by `yarn dev` (emulator) and `yarn android:apk` (sideloadable APK).
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const ANDROID_DIR = join(ROOT, "apps", "android");
export const GRADLE_DIR = join(ANDROID_DIR, "android");
export const APP_ID = "app.architech";

const WIN = process.platform === "win32";
const exe = (name) => (WIN ? `${name}.exe` : name);

export const log = (msg) => console.log(`\x1b[32m[android]\x1b[0m ${msg}`);
export const warn = (msg) => console.log(`\x1b[33m[android]\x1b[0m ${msg}`);

// ---- SDK ----

export function sdkRoot() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    WIN ? join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "Android", "Sdk") : null,
    process.platform === "darwin" ? join(homedir(), "Library", "Android", "sdk") : join(homedir(), "Android", "Sdk"),
  ].filter(Boolean);
  return candidates.find((p) => existsSync(join(p, "platform-tools"))) ?? null;
}

export const adbPath = (sdk) => join(sdk, "platform-tools", exe("adb"));
export const emulatorPath = (sdk) => join(sdk, "emulator", exe("emulator"));

export function adb(sdk, args, opts = {}) {
  const r = spawnSync(adbPath(sdk), args, { encoding: "utf8", ...opts });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}`.trim(), err: `${r.stderr ?? ""}`.trim() };
}

/** Connected devices that are ready ("device" state). */
export function devices(sdk) {
  const { out } = adb(sdk, ["devices"]);
  return out
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state === "device")
    .map(([serial]) => ({ serial, emulator: serial.startsWith("emulator-") }));
}

export function listAvds(sdk) {
  const r = spawnSync(emulatorPath(sdk), ["-list-avds"], { encoding: "utf8" });
  return `${r.stdout ?? ""}`
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("INFO") && !s.includes(" "));
}

export function startEmulator(sdk, avd) {
  const child = spawn(emulatorPath(sdk), ["-avd", avd, "-netdelay", "none", "-netspeed", "full", "-no-snapshot-save"], { detached: true, stdio: "ignore" });
  child.unref();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitForBoot(sdk, { timeoutMs = 240_000, emulatorOnly = true } = {}) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const d = devices(sdk).find((x) => !emulatorOnly || x.emulator);
    if (d && adb(sdk, ["-s", d.serial, "shell", "getprop", "sys.boot_completed"]).out === "1") return d.serial;
    await sleep(2000);
  }
  throw new Error("The Android emulator didn't finish starting in time.");
}

// ---- Java (Gradle 8.14 + Capacitor 8 need JDK 21-24) ----

export function javaMajor(javaHome) {
  const bin = join(javaHome, "bin", exe("java"));
  if (!existsSync(bin)) return null;
  const r = spawnSync(bin, ["-version"], { encoding: "utf8" });
  const m = `${r.stderr ?? ""}${r.stdout ?? ""}`.match(/version "(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  const v = Number(m[1]);
  return v === 1 ? Number(m[2]) : v;
}

export const javaOk = (v) => v !== null && v >= 21 && v <= 24;

function jdkCacheDir() {
  return WIN ? join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "architech", "jdk") : join(homedir(), ".cache", "architech", "jdk");
}

function homesUnder(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((e) => [join(dir, e.name), join(dir, e.name, "Contents", "Home")]);
}

export function findJdk() {
  const pf = process.env.ProgramFiles ?? "C:\\Program Files";
  const candidates = [
    process.env.ARCHITECH_JAVA_HOME,
    process.env.JAVA_HOME,
    ...homesUnder(jdkCacheDir()),
    ...(WIN ? [join(pf, "Microsoft"), join(pf, "Eclipse Adoptium"), join(pf, "Java"), join(pf, "Zulu")].flatMap(homesUnder) : []),
    ...homesUnder(join(homedir(), ".jdks")),
    ...(process.platform === "darwin" ? homesUnder("/Library/Java/JavaVirtualMachines") : homesUnder("/usr/lib/jvm")),
  ].filter(Boolean);
  return candidates.find((h) => javaOk(javaMajor(h))) ?? null;
}

/** Finds a JDK 21, or downloads a private copy (Eclipse Temurin) the first time. */
export async function ensureJdk() {
  const found = findJdk();
  if (found) return found;
  const os = WIN ? "windows" : process.platform === "darwin" ? "mac" : "linux";
  const arch = process.arch === "arm64" ? "aarch64" : "x64";
  const url = `https://api.adoptium.net/v3/binary/latest/21/ga/${os}/${arch}/jdk/hotspot/normal/eclipse`;
  log("Downloading Java 21 for the Android build (one time, about 200 MB)...");
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Couldn't download Java 21 (${res.status}). Install JDK 21 and set JAVA_HOME.`);
  const file = join(tmpdir(), `architech-jdk21.${WIN ? "zip" : "tar.gz"}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(file));
  const dest = jdkCacheDir();
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const r = spawnSync("tar", ["-xf", file, "-C", dest], { stdio: "inherit" });
  rmSync(file, { force: true });
  if (r.status !== 0) throw new Error("Couldn't unpack Java 21.");
  const home = homesUnder(dest).find((h) => javaOk(javaMajor(h)));
  if (!home) throw new Error("Java 21 was downloaded but couldn't be started.");
  log(`Java 21 ready at ${home}`);
  return home;
}

// ---- Building ----

function capCli() {
  const req = createRequire(join(ANDROID_DIR, "package.json"));
  return join(dirname(req.resolve("@capacitor/cli/package.json")), "bin", "capacitor");
}

function run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...opts });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${[cmd, ...args].join(" ")} failed (exit ${code})`))));
  });
}

function writeLocalProperties(sdk) {
  const escaped = sdk.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
  writeFileSync(join(GRADLE_DIR, "local.properties"), `sdk.dir=${escaped}\n`);
}

/** A signing key kept on this computer so every APK you build can update the last one. */
export function ensureKeystore(javaHome) {
  const props = join(GRADLE_DIR, "keystore.properties");
  const store = join(GRADLE_DIR, "architech-release.keystore");
  if (existsSync(props) && existsSync(store)) return store;
  const pass = randomBytes(18).toString("base64url");
  const r = spawnSync(
    join(javaHome, "bin", exe("keytool")),
    ["-genkeypair", "-keystore", store, "-storetype", "PKCS12", "-alias", "architech", "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000", "-storepass", pass, "-keypass", pass, "-dname", "CN=HomeRedo, O=HomeRedo, C=US"],
    { stdio: "inherit" },
  );
  if (r.status !== 0) throw new Error("Couldn't create the app signing key.");
  writeFileSync(props, `storeFile=architech-release.keystore\nstorePassword=${pass}\nkeyAlias=architech\nkeyPassword=${pass}\n`);
  log(`Created a signing key at ${store} - keep it (back it up) so future APKs install as updates.`);
  return store;
}

export async function buildApk({ serverUrl, release, sdk, javaHome, versionCode }) {
  const env = { ...process.env, CAP_SERVER_URL: serverUrl, JAVA_HOME: javaHome, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
  log(`Pointing the app at ${serverUrl}`);
  await run(process.execPath, [capCli(), "sync", "android"], { cwd: ANDROID_DIR, env });
  writeLocalProperties(sdk);
  if (release) ensureKeystore(javaHome);
  const task = release ? "assembleRelease" : "assembleDebug";
  const props = [`-ParchitechVersionCode=${versionCode ?? 1}`, `-ParchitechVersionName=1.0.${versionCode ?? 1}`];
  if (WIN) await run("cmd.exe", ["/d", "/s", "/c", "gradlew.bat", task, "--console=plain", ...props], { cwd: GRADLE_DIR, env });
  else await run("./gradlew", [task, "--console=plain", ...props], { cwd: GRADLE_DIR, env });
  const apk = release ? join(GRADLE_DIR, "app", "build", "outputs", "apk", "release", "app-release.apk") : join(GRADLE_DIR, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
  if (!existsSync(apk)) throw new Error(`Build finished but ${apk} is missing.`);
  return apk;
}

export function installAndLaunch(sdk, serial, apk) {
  log(`Installing on ${serial}...`);
  let r = adb(sdk, ["-s", serial, "install", "-r", "-d", apk]);
  if (!r.ok && /INSTALL_FAILED_UPDATE_INCOMPATIBLE|signatures do not match/i.test(r.out + r.err)) {
    warn("The installed app was signed with a different key - reinstalling (its saved data on the device is removed).");
    adb(sdk, ["-s", serial, "uninstall", APP_ID]);
    r = adb(sdk, ["-s", serial, "install", "-r", apk]);
  }
  if (!r.ok) throw new Error(`Install failed: ${r.err || r.out}`);
  adb(sdk, ["-s", serial, "shell", "am", "start", "-n", `${APP_ID}/.MainActivity`]);
}
