import { describe, expect, it } from "vitest";
import { isPrivateHost, trustedOriginsFor } from "./origins";

describe("trusted origins", () => {
  it("recognizes home-network and emulator hosts", () => {
    expect(isPrivateHost("10.0.2.2")).toBe(true);
    expect(isPrivateHost("192.168.1.42")).toBe(true);
    expect(isPrivateHost("172.20.0.3")).toBe(true);
    expect(isPrivateHost("localhost")).toBe(true);
    expect(isPrivateHost("172.40.0.3")).toBe(false);
    expect(isPrivateHost("evil.com")).toBe(false);
    expect(isPrivateHost("8.8.8.8")).toBe(false);
  });

  it("trusts the phone on the LAN only in development", () => {
    const base = { appUrl: "http://localhost:3000", extra: "", requestOrigin: "http://192.168.1.42:3000" };
    expect(trustedOriginsFor({ ...base, production: false })).toContain("http://192.168.1.42:3000");
    expect(trustedOriginsFor({ ...base, production: true })).toEqual(["http://localhost:3000"]);
  });

  it("never trusts public origins automatically and adds configured extras", () => {
    const list = trustedOriginsFor({ appUrl: "https://architech.fly.dev", extra: "https://a.com, https://b.com", production: false, requestOrigin: "https://evil.com" });
    expect(list).toEqual(["https://architech.fly.dev", "https://a.com", "https://b.com"]);
  });
});
