import type { Drawing } from "@architech/core";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { pickAspectRatio } from "./aspect";
import { pixelLock } from "./composite";
import { renderGuide, renderMask } from "./drawings";
import { renderLook } from "./looks";
import { prepareUpload } from "./prepare";

const solid = (w: number, h: number, rgb: [number, number, number]) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }).jpeg({ quality: 95 }).toBuffer();

const pngSolid = (w: number, h: number, rgb: [number, number, number]) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }).png().toBuffer();

async function pixel(buf: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return Array.from(data.subarray(i, i + info.channels));
}

const base = { number: 1, zoneHeight: 0, options: {}, note: "", dims: {} };

describe("prepareUpload", () => {
  it("shrinks big photos to 1536 on the long edge as JPEG", async () => {
    const big = await solid(4000, 3000, [120, 130, 140]);
    const out = await prepareUpload(big);
    expect(out.width).toBe(1536);
    expect(out.height).toBe(1152);
    const meta = await sharp(out.buffer).metadata();
    expect(meta.format).toBe("jpeg");
  });

  it("applies EXIF rotation so portrait photos stay upright", async () => {
    const rotated = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#888" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const out = await prepareUpload(rotated);
    expect(out.width).toBe(600);
    expect(out.height).toBe(800);
  });

  it("rejects things that are not images", async () => {
    await expect(prepareUpload(Buffer.from("hello"))).rejects.toThrow(/photo/i);
  });
});

describe("renderMask", () => {
  it("fills area drawings and leaves the rest black", async () => {
    const pool: Drawing = {
      ...base,
      id: "p",
      itemType: "pool",
      kind: "area",
      shape: "rect",
      points: [
        { x: 0.3, y: 0.5 },
        { x: 0.7, y: 0.5 },
        { x: 0.7, y: 0.8 },
        { x: 0.3, y: 0.8 },
      ],
    };
    const mask = await renderMask([pool], 400, 300);
    expect((await pixel(mask, 200, 195))[0]).toBe(255);
    expect((await pixel(mask, 20, 20))[0]).toBe(0);
  });

  it("follows a perspective top and keeps a foreground object out of the zone", async () => {
    const fence: Drawing = {
      ...base,
      id: "f",
      itemType: "fence",
      kind: "line",
      shape: "polyline",
      zoneHeight: 0.3,
      points: [
        { x: 0.1, y: 0.8 },
        { x: 0.9, y: 0.8 },
      ],
    };
    const mask = await renderMask([fence], 400, 300, {
      tops: { f: [0.4, 0.7] },
      occluders: [
        [
          { x: 0.4, y: 0.55 },
          { x: 0.6, y: 0.55 },
          { x: 0.6, y: 0.85 },
          { x: 0.4, y: 0.85 },
        ],
      ],
    });
    expect((await pixel(mask, 80, 180))[0]).toBe(255); // near post, inside the tall face
    expect((await pixel(mask, 340, 150))[0]).toBe(0); // far end, above the shorter top
    expect((await pixel(mask, 200, 200))[0]).toBe(0); // the car, kept out of the edit
  });

  it("extends tall line items upward by their zone height", async () => {
    const fence: Drawing = {
      ...base,
      id: "f",
      itemType: "fence",
      kind: "line",
      shape: "polyline",
      zoneHeight: 0.3,
      points: [
        { x: 0.1, y: 0.8 },
        { x: 0.9, y: 0.8 },
      ],
    };
    const mask = await renderMask([fence], 400, 300);
    expect((await pixel(mask, 200, 240 - 60))[0]).toBe(255); // inside the zone
    expect((await pixel(mask, 200, 60))[0]).toBe(0); // well above the zone
  });

  it("paints brush strokes and erases with eraser strokes", async () => {
    const brush: Drawing = {
      ...base,
      id: "b",
      itemType: "change-area",
      kind: "brush",
      shape: "stroke",
      points: [],
      strokes: [
        { points: [{ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }], size: 0.1, erase: false },
        { points: [{ x: 0.7, y: 0.5 }, { x: 0.8, y: 0.5 }], size: 0.2, erase: true },
      ],
    };
    const mask = await renderMask([brush], 400, 300);
    expect((await pixel(mask, 120, 150))[0]).toBe(255);
    expect((await pixel(mask, 300, 150))[0]).toBe(0);
  });

  it("returns an all-white mask when there are no drawings (whole photo editable)", async () => {
    const mask = await renderMask([], 100, 80);
    expect((await pixel(mask, 50, 40))[0]).toBe(255);
  });
});

describe("renderGuide", () => {
  it("draws each drawing on the photo in its number's color", async () => {
    const photo = await solid(400, 300, [200, 200, 200]);
    const fence: Drawing = {
      ...base,
      id: "f",
      itemType: "fence",
      kind: "line",
      shape: "polyline",
      points: [
        { x: 0.1, y: 0.5 },
        { x: 0.9, y: 0.5 },
      ],
    };
    const guide = await renderGuide(photo, [fence]);
    const [r, g, b] = await pixel(guide, 200, 150);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(140);
    expect(b).toBeLessThan(120);
  });

  it("draws the top of a standing fence as well as its base", async () => {
    const photo = await solid(400, 300, [200, 200, 200]);
    const fence: Drawing = {
      ...base,
      id: "f",
      itemType: "fence",
      kind: "line",
      shape: "polyline",
      zoneHeight: 0.3,
      points: [
        { x: 0.1, y: 0.8 },
        { x: 0.9, y: 0.8 },
      ],
    };
    const guide = await renderGuide(photo, [fence]);
    const [r, g, b] = await pixel(guide, 200, 150);
    expect(r).toBeGreaterThan((g ?? 0) + 30);
    expect(r).toBeGreaterThan((b ?? 0) + 30);
    const above = await pixel(guide, 200, 40);
    expect(above[0]).toBeGreaterThan(180);
    expect(above[1]).toBeGreaterThan(180);
  });
});

describe("renderLook", () => {
  it("renders a fence preset as a jpeg the model can copy", async () => {
    const buf = await renderLook("fence", "dog-ear");
    expect(buf![0]).toBe(0xff);
    expect(buf![1]).toBe(0xd8);
    const meta = await sharp(buf!).metadata();
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(480);
    expect(await renderLook("pool", "dog-ear")).toBeNull();
  });
});

describe("pixelLock", () => {
  it("keeps every pixel outside the edit zone identical to the original", async () => {
    const original = await pngSolid(200, 100, [90, 100, 110]);
    const edited = await pngSolid(300, 160, [250, 10, 10]); // AI output at a different size
    const mask = await sharp({ create: { width: 200, height: 100, channels: 3, background: "#000" } })
      .composite([{ input: Buffer.from('<svg width="200" height="100"><rect x="80" y="30" width="40" height="40" fill="#fff"/></svg>') }])
      .png()
      .toBuffer();
    const out = await pixelLock(original, edited, mask, { featherPx: 3, format: "png" });
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(100);
    expect(await pixel(out, 5, 5)).toEqual([90, 100, 110]);
    expect(await pixel(out, 190, 90)).toEqual([90, 100, 110]);
    const center = await pixel(out, 100, 50);
    expect(center[0]).toBeGreaterThan(240);
  });
});

describe("pickAspectRatio", () => {
  it("chooses the closest supported ratio", () => {
    expect(pickAspectRatio(1536, 1024)).toBe("3:2");
    expect(pickAspectRatio(1024, 1536)).toBe("2:3");
    expect(pickAspectRatio(1536, 1152)).toBe("4:3");
    expect(pickAspectRatio(1920, 1080)).toBe("16:9");
    expect(pickAspectRatio(1000, 1000)).toBe("1:1");
  });
});
