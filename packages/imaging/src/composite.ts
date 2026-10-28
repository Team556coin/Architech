import sharp from "sharp";

export interface PixelLockOptions {
  featherPx?: number;
  format?: "jpeg" | "png";
}

/**
 * Paste the original photo back everywhere outside the edit zone.
 * The AI result is resized onto the original, the mask edge is feathered, and pixels where the
 * mask is black come straight from the original.
 */
export async function pixelLock(original: Buffer, edited: Buffer, mask: Buffer, opts: PixelLockOptions = {}): Promise<Buffer> {
  const meta = await sharp(original).metadata();
  const W = meta.width!;
  const H = meta.height!;
  const feather = opts.featherPx ?? Math.max(2, Math.round(0.006 * Math.max(W, H)));

  const editedRgb = await sharp(edited).resize(W, H, { fit: "fill" }).removeAlpha().toColourspace("srgb").raw().toBuffer();

  // Feather inward so pixels outside the drawn zone stay untouched.
  let alphaPipeline = sharp(mask).resize(W, H, { fit: "fill" }).grayscale();
  if (feather > 0) alphaPipeline = alphaPipeline.blur(feather / 2).linear(1, 0);
  const blurred = await alphaPipeline.raw().toBuffer();
  const hard = await sharp(mask).resize(W, H, { fit: "fill" }).grayscale().raw().toBuffer();
  const alpha = Buffer.alloc(W * H);
  for (let i = 0; i < alpha.length; i++) alpha[i] = hard[i]! < 128 ? 0 : blurred[i]!;

  const overlay = await sharp(editedRgb, { raw: { width: W, height: H, channels: 3 } })
    .joinChannel(alpha, { raw: { width: W, height: H, channels: 1 } })
    .png()
    .toBuffer();

  const out = sharp(original).removeAlpha().composite([{ input: overlay }]);
  return opts.format === "png" ? out.png().toBuffer() : out.jpeg({ quality: 93 }).toBuffer();
}

/** Fraction of pixels outside the mask that changed by more than `tolerance` (0 = perfectly locked). */
export async function changedOutsideMask(original: Buffer, result: Buffer, mask: Buffer, tolerance = 12): Promise<number> {
  const meta = await sharp(original).metadata();
  const W = meta.width!;
  const H = meta.height!;
  const a = await sharp(original).removeAlpha().raw().toBuffer();
  const b = await sharp(result).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const m = await sharp(mask).resize(W, H, { fit: "fill" }).grayscale().raw().toBuffer();
  let outside = 0;
  let changed = 0;
  for (let i = 0; i < W * H; i++) {
    if (m[i]! >= 128) continue;
    outside++;
    const j = i * 3;
    if (Math.abs(a[j]! - b[j]!) + Math.abs(a[j + 1]! - b[j + 1]!) + Math.abs(a[j + 2]! - b[j + 2]!) > tolerance * 3) changed++;
  }
  return outside ? changed / outside : 0;
}
