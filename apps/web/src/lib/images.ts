const MAX_SEND_EDGE = 3072;

export function isHeic(file: Blob & { name?: string }): boolean {
  const name = (file.name ?? "").toLowerCase();
  return /image\/hei[cf]/.test(file.type) || name.endsWith(".heic") || name.endsWith(".heif");
}

async function readFocal35(file: Blob): Promise<number | null> {
  try {
    const exifr = (await import("exifr")).default;
    const tags = await exifr.parse(file, { pick: ["FocalLengthIn35mmFormat"] });
    const f = tags?.FocalLengthIn35mmFormat;
    return typeof f === "number" && f > 8 && f < 400 ? f : null;
  } catch {
    return null;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type = "image/jpeg", quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image"))), type, quality));
}

async function decode(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob, { imageOrientation: "from-image" });
}

async function resizeBlob(blob: Blob, maxEdge: number, quality: number): Promise<Blob> {
  const bmp = await decode(blob);
  const s = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * s);
  canvas.height = Math.round(bmp.height * s);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvasToBlob(canvas, "image/jpeg", quality);
}

/**
 * Gets a picked photo ready to send: converts iPhone HEIC photos, shrinks very large ones,
 * and reads the lens info first (it is lost when converting).
 */
export async function preparePhoto(file: Blob & { name?: string }): Promise<{ blob: Blob; focal35: number | null }> {
  const focal35 = await readFocal35(file);
  let blob: Blob = file;
  if (isHeic(file)) {
    const heic2any = (await import("heic2any")).default;
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    blob = Array.isArray(out) ? out[0]! : out;
  }
  try {
    const bmp = await decode(blob);
    const big = Math.max(bmp.width, bmp.height) > MAX_SEND_EDGE || blob.size > 12 * 1024 * 1024;
    bmp.close();
    if (big) blob = await resizeBlob(blob, MAX_SEND_EDGE, 0.92);
  } catch {
    // Let the server decide whether it is a picture.
  }
  return { blob, focal35 };
}

export async function makeThumb(blob: Blob, edge = 480): Promise<Blob> {
  try {
    return await resizeBlob(blob, edge, 0.8);
  } catch {
    return blob;
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

export { canvasToBlob };
