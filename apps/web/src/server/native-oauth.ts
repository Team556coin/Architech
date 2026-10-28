import { createHash, randomBytes } from "node:crypto";
import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const challengeSchema = z.string().regex(/^[a-f0-9]{64}$/);

/** Browser-to-Android handoff. Codes expire, are single use, and require the device's verifier. */
export const nativeOAuth = () => ({
  id: "native-oauth",
  endpoints: {
    completeNativeOAuth: createAuthEndpoint("/native/complete", {
      method: "GET",
      query: z.object({ challenge: challengeSchema }),
      use: [sessionMiddleware],
    }, async (ctx) => {
      const code = randomBytes(32).toString("hex");
      await ctx.context.internalAdapter.createVerificationValue({
        identifier: `native-oauth:${sha256(code)}`,
        value: JSON.stringify({ challenge: ctx.query.challenge, sessionToken: ctx.context.session.session.token }),
        expiresAt: new Date(Date.now() + 120_000),
      });
      // A fragment keeps the one-use code out of server access logs and referrers.
      const link = `app.architech://auth#code=${code}`;
      return new Response(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Return to HomeRedo</title><body style="font:20px system-ui;text-align:center;padding:48px;background:#faf7f2"><h1>You're signed in</h1><p><a href="${link}">Return to HomeRedo</a></p><p>You can close this browser tab after returning to the app.</p></body></html>`, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'" },
      });
    }),
    exchangeNativeOAuth: createAuthEndpoint("/native/exchange", {
      method: "POST",
      body: z.object({ code: z.string().regex(/^[a-f0-9]{64}$/), verifier: z.string().regex(/^[a-f0-9]{64}$/) }),
    }, async (ctx) => {
      const identifier = `native-oauth:${sha256(ctx.body.code)}`;
      const record = await ctx.context.internalAdapter.findVerificationValue(identifier);
      if (!record || record.expiresAt.getTime() <= Date.now()) throw ctx.error("BAD_REQUEST", { message: "Sign-in expired. Please try again." });
      const payload = JSON.parse(record.value) as { challenge: string; sessionToken: string };
      if (payload.challenge !== sha256(ctx.body.verifier)) throw ctx.error("BAD_REQUEST", { message: "This sign-in belongs to another device." });
      const consumed = await ctx.context.internalAdapter.consumeVerificationValue(identifier);
      if (!consumed || consumed.expiresAt.getTime() <= Date.now()) throw ctx.error("BAD_REQUEST", { message: "Sign-in code already used or expired." });
      const session = await ctx.context.internalAdapter.findSession(payload.sessionToken);
      if (!session || session.session.expiresAt.getTime() <= Date.now()) throw ctx.error("UNAUTHORIZED", { message: "Session expired." });
      await setSessionCookie(ctx, session);
      return ctx.json({ ok: true });
    }),
  },
});
