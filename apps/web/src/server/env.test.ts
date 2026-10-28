import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const production = {
  NODE_ENV: "production",
  APP_URL: "https://homeredo.fly.dev",
  DATABASE_URL: "postgres://user:password@db.internal/architech",
  BETTER_AUTH_SECRET: "random-production-secret-at-least-32-characters",
  S3_ENDPOINT: "https://fly.storage.tigris.dev",
  S3_ACCESS_KEY_ID: "production-key",
  S3_SECRET_ACCESS_KEY: "production-secret",
  S3_BUCKET: "architech",
  OPENROUTER_API_KEY: "test-api-key",
};

describe("production environment", () => {
  it("accepts explicitly configured production services", () => {
    expect(parseEnv(production).APP_URL).toBe(production.APP_URL);
  });
  it.each(["APP_URL", "DATABASE_URL", "BETTER_AUTH_SECRET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_BUCKET", "OPENROUTER_API_KEY"])("rejects missing %s", (key) => {
    expect(() => parseEnv({ ...production, [key]: undefined })).toThrow(key);
  });
  it("rejects HTTP and development secrets", () => {
    expect(() => parseEnv({ ...production, APP_URL: "http://localhost:3000" })).toThrow("HTTPS");
    expect(() => parseEnv({ ...production, BETTER_AUTH_SECRET: "dev-only-secret-change-me-please-0123456789" })).toThrow("BETTER_AUTH_SECRET");
    expect(() => parseEnv({ ...production, S3_SECRET_ACCESS_KEY: "architech-secret" })).toThrow("storage credentials");
  });
  it("requires a storage endpoint or R2 account", () => {
    expect(() => parseEnv({ ...production, S3_ENDPOINT: undefined })).toThrow("S3_ENDPOINT");
    expect(parseEnv({ ...production, S3_ENDPOINT: undefined, R2_ACCOUNT_ID: "account" }).R2_ACCOUNT_ID).toBe("account");
  });
  it("rejects partially configured Google login", () => {
    expect(() => parseEnv({ ...production, GOOGLE_CLIENT_ID: "client" })).toThrow("GOOGLE_CLIENT_SECRET");
  });
  it("keeps local development defaults", () => {
    expect(parseEnv({}).APP_URL).toBe("http://localhost:3000");
  });
  it("accepts the secrets provisioned by Fly Tigris", () => {
    const parsed = parseEnv({
      ...production,
      S3_ENDPOINT: undefined,
      S3_REGION: undefined,
      S3_ACCESS_KEY_ID: undefined,
      S3_SECRET_ACCESS_KEY: undefined,
      S3_BUCKET: undefined,
      AWS_ENDPOINT_URL_S3: "https://fly.storage.tigris.dev",
      AWS_REGION: "auto",
      AWS_ACCESS_KEY_ID: "tigris-key",
      AWS_SECRET_ACCESS_KEY: "tigris-secret",
      BUCKET_NAME: "architech-photos",
    });
    expect(parsed.S3_BUCKET).toBe("architech-photos");
    expect(parsed.S3_ACCESS_KEY_ID).toBe("tigris-key");
  });
});
