import { ensureProfile, schema } from "@architech/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import { env } from "./env";
import { trustedOriginsFor } from "./origins";
import { nativeOAuth } from "./native-oauth";

function build() {
  const e = env();
  return betterAuth({
    appName: "HomeRedo",
    baseURL: e.APP_URL,
    secret: e.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db(), {
      provider: "pg",
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
    }),
    emailAndPassword: { enabled: true, autoSignIn: true, minPasswordLength: 6, maxPasswordLength: 128 },
    socialProviders:
      e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET ? { google: { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET } } : {},
    session: { expiresIn: 60 * 60 * 24 * 60, updateAge: 60 * 60 * 24 },
    trustedOrigins: (request) =>
      trustedOriginsFor({ appUrl: e.APP_URL, extra: e.TRUSTED_ORIGINS, production: e.NODE_ENV === "production", requestOrigin: request?.headers.get("origin") ?? null }),
    rateLimit: { enabled: e.NODE_ENV !== "test", window: 60, max: 60 },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await ensureProfile(db(), user.id);
          },
        },
      },
    },
    plugins: [nativeOAuth(), nextCookies()],
  });
}

type Auth = ReturnType<typeof build>;
const g = globalThis as unknown as { __architechAuth?: Auth };

export function auth(): Auth {
  if (!g.__architechAuth) g.__architechAuth = build();
  return g.__architechAuth;
}
