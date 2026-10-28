import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).default("postgres://architech:architech@localhost:5433/architech"),
  BETTER_AUTH_SECRET: z.string().min(16).default("dev-only-secret-change-me-please-0123456789"),
  /** Extra origins allowed to call the API (comma separated), e.g. the Android app or a LAN address. */
  TRUSTED_ORIGINS: z.string().default(""),
  AI_PROVIDER: z.enum(["openrouter", "mock"]).default("openrouter"),
  OPENROUTER_API_KEY: z.string().default(""),
  AI_VISION_MODEL: z.string().default("google/gemini-4-argon"),
  AI_IMAGE_MODEL: z.string().default("openai/gpt-image-2.5-sunburst"),
  /** Cloudflare R2 (or any S3-compatible store). */
  R2_ACCOUNT_ID: z.string().default(""),
  S3_ENDPOINT: z.string().default(""),
  S3_REGION: z.string().default("auto"),
  S3_ACCESS_KEY_ID: z.string().default("architech"),
  S3_SECRET_ACCESS_KEY: z.string().default("architech-secret"),
  S3_BUCKET: z.string().default("architech"),
  S3_CREATE_BUCKET: z.enum(["true", "false"]).default("false"),
  WORKER_CONCURRENCY: z.coerce.number().int().min(0).max(8).default(2),
  AUTO_MIGRATE: z.enum(["true", "false"]).default("true"),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
});

export type Env = z.infer<typeof schema>;

export function parseEnv(input: Record<string, string | undefined>): Env {
  // Fly's Tigris integration installs the standard AWS variable names.
  input = {
    ...input,
    S3_ENDPOINT: input.S3_ENDPOINT || input.AWS_ENDPOINT_URL_S3,
    S3_REGION: input.S3_REGION || input.AWS_REGION,
    S3_ACCESS_KEY_ID: input.S3_ACCESS_KEY_ID || input.AWS_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: input.S3_SECRET_ACCESS_KEY || input.AWS_SECRET_ACCESS_KEY,
    S3_BUCKET: input.BUCKET_NAME || input.S3_BUCKET,
  };
  const parsed = schema.parse(input);
  if (parsed.NODE_ENV === "production") {
    // Browser tests exercise a production build against loopback-only mock services.
    const localMock = parsed.AI_PROVIDER === "mock" && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(parsed.APP_URL).hostname);
    const required = ["APP_URL", "DATABASE_URL", "BETTER_AUTH_SECRET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_BUCKET"];
    for (const key of required) {
      if (!input[key]?.trim()) throw new Error(`Set ${key} in production.`);
    }
    if (parsed.BETTER_AUTH_SECRET.length < 32 || parsed.BETTER_AUTH_SECRET.startsWith("dev-only")) {
      throw new Error("Set a random BETTER_AUTH_SECRET of at least 32 characters in production.");
    }
    if (!localMock && !parsed.APP_URL.startsWith("https://")) throw new Error("APP_URL must use HTTPS in production.");
    if (!parsed.S3_ENDPOINT && !parsed.R2_ACCOUNT_ID) throw new Error("Set S3_ENDPOINT or R2_ACCOUNT_ID in production.");
    if (!localMock && (parsed.S3_ACCESS_KEY_ID === "architech" || parsed.S3_SECRET_ACCESS_KEY === "architech-secret")) {
      throw new Error("Replace development storage credentials in production.");
    }
    if (parsed.AI_PROVIDER === "openrouter" && !parsed.OPENROUTER_API_KEY.trim()) {
      throw new Error("Set OPENROUTER_API_KEY in production.");
    }
    if (Boolean(parsed.GOOGLE_CLIENT_ID) !== Boolean(parsed.GOOGLE_CLIENT_SECRET)) {
      throw new Error("Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
    }
  }
  return parsed;
}

let cached: Env | null = null;
export function env(): Env {
  if (!cached) {
    cached = parseEnv(process.env);
  }
  return cached;
}

export function s3Endpoint(e: Env = env()): string {
  if (e.S3_ENDPOINT) return e.S3_ENDPOINT;
  if (e.R2_ACCOUNT_ID) return `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  return "http://localhost:8333";
}

export function aiReady(e: Env = env()): boolean {
  return e.AI_PROVIDER === "mock" || e.OPENROUTER_API_KEY.length > 0;
}
