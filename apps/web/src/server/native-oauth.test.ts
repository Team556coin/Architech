import { createHash, randomBytes } from "node:crypto";
import { runMigrations, schema } from "@architech/db";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { auth } from "./auth";
import { db } from "./db";

const BASE = "http://localhost:3000";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const cookieOf = (response: Response) => response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const call = (path: string, cookie = "", body?: unknown) => auth().handler(new Request(`${BASE}/api/auth${path}`, {
  method: body ? "POST" : "GET",
  headers: { origin: BASE, cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}));
let browserCookie = "";

beforeAll(async () => {
  await runMigrations(db());
  const response = await call("/sign-up/email", "", { name: "OAuth test", email: `native-${randomBytes(8).toString("hex")}@example.com`, password: "test-password-1234" });
  expect(response.status).toBe(200);
  browserCookie = cookieOf(response);
});

async function issue(verifier: string) {
  const response = await call(`/native/complete?challenge=${sha(verifier)}`, browserCookie);
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  return (await response.text()).match(/#code=([a-f0-9]{64})/)![1]!;
}

describe("native Google OAuth handoff", () => {
  it("requires a signed-in browser before issuing a code", async () => {
    const response = await call(`/native/complete?challenge=${"a".repeat(64)}`);
    expect(response.status).toBe(401);
  });
  it("sets an app session cookie and rejects a second redemption", async () => {
    const verifier = randomBytes(32).toString("hex");
    const code = await issue(verifier);
    const response = await call("/native/exchange", "", { code, verifier });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const session = await call("/get-session", cookieOf(response));
    expect((await session.json()).user.name).toBe("OAuth test");
    expect((await call("/native/exchange", "", { code, verifier })).status).toBe(400);
  });
  it("does not redeem a code intercepted by another app", async () => {
    const verifier = randomBytes(32).toString("hex");
    const code = await issue(verifier);
    expect((await call("/native/exchange", "", { code, verifier: "0".repeat(64) })).status).toBe(400);
    expect((await call("/native/exchange", "", { code, verifier })).status).toBe(200);
  });
  it("rejects expired codes", async () => {
    const verifier = randomBytes(32).toString("hex");
    const code = await issue(verifier);
    await db().update(schema.verification).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.verification.identifier, `native-oauth:${sha(code)}`));
    expect((await call("/native/exchange", "", { code, verifier })).status).toBe(400);
  });
  it("allows only one concurrent redemption", async () => {
    const verifier = randomBytes(32).toString("hex");
    const code = await issue(verifier);
    const results = await Promise.all([call("/native/exchange", "", { code, verifier }), call("/native/exchange", "", { code, verifier })]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });
});
