import { Capacitor } from "@capacitor/core";

/** True inside the Android app. */
export const isNative = () => typeof window !== "undefined" && Capacitor.isNativePlatform();

function base64ToBlob(data: string, type = "image/jpeg"): Blob {
  const clean = data.includes(",") ? data.slice(data.indexOf(",") + 1) : data;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

async function readUri(uri: string, webPath?: string): Promise<Blob> {
  for (const src of [webPath, Capacitor.convertFileSrc(uri)].filter(Boolean) as string[]) {
    try {
      const res = await fetch(src);
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size > 0) return blob;
      }
    } catch {
      // try the next way
    }
  }
  const { Filesystem } = await import("@capacitor/filesystem");
  const file = await Filesystem.readFile({ path: uri });
  if (typeof file.data === "string") return base64ToBlob(file.data);
  return file.data;
}

/** Opens the phone camera or gallery. Returns null if the person backs out. */
export async function pickNativePhoto(source: "camera" | "gallery"): Promise<Blob | null> {
  const { Camera } = await import("@capacitor/camera");
  try {
    if (source === "camera") {
      const r = await Camera.takePhoto({ quality: 90, targetWidth: 3072, targetHeight: 3072, correctOrientation: true, saveToGallery: false });
      if (!r.uri && !r.webPath) return null;
      return readUri(r.uri ?? r.webPath!, r.webPath);
    }
    const res = await Camera.chooseFromGallery({ allowMultipleSelection: false, quality: 90, targetWidth: 3072, targetHeight: 3072, correctOrientation: true });
    const r = res.results[0];
    if (!r || (!r.uri && !r.webPath)) return null;
    return readUri(r.uri ?? r.webPath!, r.webPath);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).toLowerCase();
    if (msg.includes("cancel")) return null;
    throw e;
  }
}

/** Saves or shares a picture from the Android app through the system share sheet. */
export async function shareNativeImage(blob: Blob, fileName: string, title: string): Promise<void> {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  const written = await Filesystem.writeFile({ path: fileName, data, directory: Directory.Cache });
  await Share.share({ title, files: [written.uri], dialogTitle: title });
}
