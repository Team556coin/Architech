import { MAX_IMAGE_EDGE } from "@architech/core";
import exifr from "exifr";
import sharp from "sharp";

export interface PreparedImage {
  buffer: Buffer;
  width: number;
  height: number;
  /** Focal length in pixels for the prepared size, when the camera recorded it. */
  focalPx?: number;
}

export class NotAnImageError extends Error {
  constructor() {
    super("That file doesn't look like a photo. Try a JPG or PNG.");
  }
}

async function focal35(buffer: Buffer): Promise<number | undefined> {
  try {
    const tags = await exifr.parse(buffer, { pick: ["FocalLengthIn35mmFormat"] });
    const f = tags?.FocalLengthIn35mmFormat;
    return typeof f === "number" && f > 8 && f < 400 ? f : undefined;
  } catch {
    return undefined;
  }
}

/** Upright, resized, metadata-free JPEG ready for storage and AI. */
export async function prepareUpload(input: Buffer, maxEdge = MAX_IMAGE_EDGE): Promise<PreparedImage> {
  let meta;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new NotAnImageError();
  }
  if (!meta.width || !meta.height) throw new NotAnImageError();
  const f35 = await focal35(input);
  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const longEdge = Math.max(info.width, info.height);
  return {
    buffer: data,
    width: info.width,
    height: info.height,
    focalPx: f35 ? (f35 * longEdge) / 36 : undefined,
  };
}

export async function imageSize(buffer: Buffer): Promise<{ width: number; height: number }> {
  const m = await sharp(buffer).metadata();
  if (!m.width || !m.height) throw new NotAnImageError();
  return { width: m.width, height: m.height };
}

export async function thumbnail(buffer: Buffer, edge = 480): Promise<Buffer> {
  return sharp(buffer).resize({ width: edge, height: edge, fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
}
