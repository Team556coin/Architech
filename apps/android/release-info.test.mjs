import { describe, expect, it } from "vitest";
import { apkName, isLocalServer, sideloadSteps, versionCodeAt } from "./release-info.mjs";

describe("release info", () => {
  it("makes a version code that goes up with every build", () => {
    const a = versionCodeAt(new Date("2026-10-17T12:00:00Z"));
    const b = versionCodeAt(new Date("2026-10-17T12:01:00Z"));
    expect(b).toBeGreaterThan(a);
    expect(Number.isInteger(a)).toBe(true);
  });

  it("stays inside Android's version code limit for decades", () => {
    expect(versionCodeAt(new Date("2080-01-01T00:00:00Z"))).toBeLessThan(2_100_000_000);
    expect(versionCodeAt(new Date("2024-01-01T00:00:00Z"))).toBeGreaterThan(0);
  });

  it("names the APK after its version", () => {
    expect(apkName(1234)).toBe("HomeRedo-1.0.1234.apk");
  });

  it("knows a home-network server from a hosted one", () => {
    expect(isLocalServer("http://192.168.1.42:3000")).toBe(true);
    expect(isLocalServer("http://10.0.0.5:3000")).toBe(true);
    expect(isLocalServer("https://homeredo.fly.dev")).toBe(false);
  });

  it("tells you to keep this computer running on the same Wi-Fi for a home-network server", () => {
    const text = sideloadSteps({ serverUrl: "http://192.168.1.42:3000", apkPath: "C:\\x\\HomeRedo.apk" }).join("\n");
    expect(text).toMatch(/same Wi-Fi/);
    expect(text).toMatch(/yarn dev/);
    expect(text).toMatch(/localport=3000/);
    expect(text).toMatch(/C:\\x\\HomeRedo\.apk/);
  });

  it("skips the Wi-Fi steps for a hosted server", () => {
    const text = sideloadSteps({ serverUrl: "https://homeredo.fly.dev", apkPath: "a.apk" }).join("\n");
    expect(text).not.toMatch(/same Wi-Fi/);
    expect(text).toMatch(/Install unknown apps/);
  });
});
