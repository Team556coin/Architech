import sharp from "sharp";

export const SUPPORTED_RATIOS = ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"] as const;
export type AspectRatio = (typeof SUPPORTED_RATIOS)[number];

const value = (r: string) => {
  const [a, b] = r.split(":").map(Number);
  return a! / b!;
};

export function pickAspectRatio(width: number, height: number, ratios: readonly string[] = SUPPORTED_RATIOS): AspectRatio {
  const target = Math.log(width / height);
  let best = ratios[0]!;
  for (const r of ratios) if (Math.abs(Math.log(value(r)) - target) < Math.abs(Math.log(value(best)) - target)) best = r;
  return best as AspectRatio;
}

/** Stretch an image to an exact ratio (long edge kept) so model output maps back onto the photo 1:1. */
export async function stretchToRatio(buffer: Buffer, ratio: string): Promise<Buffer> {
  const m = await sharp(buffer).metadata();
  const w = m.width!;
  const h = m.height!;
  const r = value(ratio);
  const long = Math.max(w, h);
  const [tw, th] = r >= 1 ? [long, Math.round(long / r)] : [Math.round(long * r), long];
  if (tw === w && th === h) return buffer;
  return sharp(buffer).resize(tw, th, { fit: "fill" }).jpeg({ quality: 92 }).toBuffer();
}
