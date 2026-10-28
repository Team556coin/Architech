// Starts a production build of the app on :3100 with the fake AI and its own database, for Playwright.
//   E2E_SKIP_BUILD=1  reuse the last build
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(WEB, "package.json"));
const nextBin = join(dirname(require.resolve("next/package.json")), "dist", "bin", "next");

const E2E_PORT = 3100;
const env = {
  ...process.env,
  NODE_ENV: "production",
  APP_URL: `http://localhost:${E2E_PORT}`,
  DATABASE_URL: "postgres://architech:architech@localhost:5433/architech_e2e",
  BETTER_AUTH_SECRET: "e2e-secret-0123456789abcdefghijklmnop",
  AI_PROVIDER: "mock",
  S3_ENDPOINT: "http://localhost:8333",
  S3_ACCESS_KEY_ID: "architech",
  S3_SECRET_ACCESS_KEY: "architech-secret",
  S3_BUCKET: "architech-e2e",
  S3_CREATE_BUCKET: "true",
  WORKER_CONCURRENCY: "2",
};

const up = spawnSync("docker", ["compose", "up", "-d", "--wait"], { cwd: join(WEB, "..", ".."), stdio: "inherit" });
if (up.status !== 0) process.exit(1);

const postgres = require("postgres");
const admin = postgres("postgres://architech:architech@localhost:5433/architech", { max: 1, onnotice: () => {} });
const found = await admin`select 1 from pg_database where datname = 'architech_e2e'`;
if (!found.length) await admin.unsafe("create database architech_e2e owner architech");
await admin.end();

if (!process.env.E2E_SKIP_BUILD) {
  const build = spawnSync(process.execPath, [nextBin, "build"], { cwd: WEB, env, stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

// `next start` rather than the standalone server.js the Docker image runs: on Windows the standalone
// trace leaves out sharp's native DLLs.
const server = spawn(process.execPath, [nextBin, "start", "--port", String(E2E_PORT)], { cwd: WEB, env, stdio: "inherit" });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.kill(sig));
server.on("exit", (code) => process.exit(code ?? 0));
