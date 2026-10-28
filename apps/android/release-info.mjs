// Version numbers and install instructions for the sideloadable APK.

const EPOCH = Date.UTC(2024, 0, 1);

/** Minutes since 2024, so each new APK installs over the last one. */
export function versionCodeAt(date = new Date()) {
  return Math.floor((date.getTime() - EPOCH) / 60_000) + 1;
}

export const apkName = (versionCode) => `HomeRedo-1.0.${versionCode}.apk`;

export function isLocalServer(serverUrl) {
  const { hostname } = new URL(serverUrl);
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);
}

export function sideloadSteps({ serverUrl, apkPath }) {
  const steps = [
    `APK: ${apkPath}`,
    `The app opens ${serverUrl}`,
    "",
    "Put it on your phone (either way works):",
    "  - USB: plug the phone in with USB debugging on, then run `yarn android:apk --install`.",
    "  - Or copy the APK to the phone (Google Drive, email, USB file transfer) and tap it.",
    "    Android asks once to allow installs from that app: Settings > Install unknown apps > allow.",
  ];
  if (isLocalServer(serverUrl)) {
    steps.push(
      "",
      "This APK talks to this computer, so while you use it:",
      "  1. Keep this computer on and run `yarn dev` (or `yarn dev:web`).",
      "  2. Keep the phone on the same Wi-Fi as this computer.",
      "  3. Let the phone through Windows Firewall once (run in an admin PowerShell):",
      '     netsh advfirewall firewall add rule name="HomeRedo dev server" dir=in action=allow protocol=TCP localport=3000 profile=private',
      "     and make sure your Wi-Fi is set to a Private network in Windows settings.",
      `  4. Check it on the phone's browser first: ${serverUrl} should show HomeRedo.`,
    );
  }
  return steps;
}
