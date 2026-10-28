import { afterEach, describe, expect, it, vi } from "vitest";
import { uid } from "./uid";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uid", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("makes v4 ids", () => {
    expect(uid()).toMatch(V4);
    expect(uid()).not.toBe(uid());
  });

  it("still works where randomUUID is missing (plain http pages in the Android app)", () => {
    const getRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
    vi.stubGlobal("crypto", { getRandomValues });
    const ids = new Set(Array.from({ length: 200 }, () => uid()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(V4);
  });
});
