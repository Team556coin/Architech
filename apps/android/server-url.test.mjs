import { describe, expect, it } from "vitest";
import { EMULATOR_URL, lanAddress, normalizeServerUrl, serverUrlFor } from "./server-url.mjs";

const nics = {
  "vEthernet (WSL)": [{ family: "IPv4", internal: false, address: "172.28.0.1" }],
  "Wi-Fi": [
    { family: "IPv6", internal: false, address: "fe80::1" },
    { family: "IPv4", internal: false, address: "192.168.1.42" },
  ],
  Loopback: [{ family: "IPv4", internal: true, address: "127.0.0.1" }],
};

describe("server url", () => {
  it("finds the Wi-Fi address and skips virtual adapters", () => {
    expect(lanAddress(nics)).toBe("192.168.1.42");
    expect(lanAddress({ Loopback: nics.Loopback })).toBeNull();
  });

  it("uses the emulator's host alias", () => {
    expect(serverUrlFor({ target: "emulator" })).toBe(EMULATOR_URL);
  });

  it("uses this computer's address for a phone", () => {
    expect(serverUrlFor({ target: "phone", interfaces: nics })).toBe("http://192.168.1.42:3000");
  });

  it("accepts a typed address or the Fly URL", () => {
    expect(normalizeServerUrl("192.168.1.20:3000")).toBe("http://192.168.1.20:3000");
    expect(normalizeServerUrl("https://homeredo.fly.dev/")).toBe("https://homeredo.fly.dev");
    expect(serverUrlFor({ target: "phone", url: "https://homeredo.fly.dev" })).toBe("https://homeredo.fly.dev");
  });
});
