import path from "node:path";
import { defineConfig } from "vitest/config";

process.env.WEB_TEST_DATABASE_URL ??= "postgres://architech:architech@localhost:5433/architech_test_web";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Its own database: packages/db's tests empty theirs while these run in parallel.
    globalSetup: ["./vitest.setup-db.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.WEB_TEST_DATABASE_URL,
      AI_PROVIDER: "mock",
      S3_BUCKET: "architech-test",
      S3_CREATE_BUCKET: "true",
      APP_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "test-secret-0123456789abcdefghijkl",
      WORKER_CONCURRENCY: "0",
    },
  },
});
