import type { CapacitorConfig } from "@capacitor/cli";

// The app shows the HomeRedo website inside a native shell (camera, photo picker, share sheet).
// CAP_SERVER_URL is set by scripts/dev.mjs (emulator) and scripts/build-apk.mjs (your phone).
const url = process.env.CAP_SERVER_URL || "http://10.0.2.2:3000";
const host = new URL(url).hostname;

const config: CapacitorConfig = {
  appId: "app.architech",
  appName: "HomeRedo",
  webDir: "www",
  server: {
    url,
    cleartext: url.startsWith("http://"),
    allowNavigation: [host],
    errorPath: "offline.html",
  },
  android: {
    backgroundColor: "#FAF7F2",
  },
};

export default config;
