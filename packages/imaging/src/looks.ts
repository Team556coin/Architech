import { getLook, looksFor } from "@architech/core";
import sharp from "sharp";

/** A JPEG close-up of a preset, sent to the image model as the boards to copy. */
export async function renderLook(itemType: string, presetId: string | undefined): Promise<Buffer | null> {
  if (!looksFor(itemType).length) return null;
  const look = getLook(itemType, presetId);
  if (!look) return null;
  return sharp(Buffer.from(look.svg)).jpeg({ quality: 90 }).toBuffer();
}
