// Renders the Android launcher icons and splash screens from the Home Redo logo.
import { readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const res = join(dirname(fileURLToPath(import.meta.url)), "..", "android", "app", "src", "main", "res");
const FOREST = "#1F4D3A";
const CORAL = "#F07A5A";
const CREAM = "#FAF7F2";

const HOUSE = "M4 15 16 4.5 28 15v12a1.5 1.5 0 0 1-1.5 1.5h-21A1.5 1.5 0 0 1 4 27z";
const ARC = "M20.5 17.4A5.2 5.2 0 1 1 14.22 15.11";
const HEAD = "M13.2 12.29 17.79 13.81 15.25 17.93z";

/** House + redo arrow centred in a size x size box, the house spanning `scale` of the box. */
function mark(size, scale, stroke = "#FFFFFF") {
  const k = (scale * size) / 32;
  const c = size / 2;
  return `<g transform="translate(${c - 16 * k} ${c - 16.5 * k}) scale(${k})">
    <path d="${HOUSE}" fill="none" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="${ARC}" fill="none" stroke="${CORAL}" stroke-width="2.8" stroke-linecap="round"/>
    <path d="${HEAD}" fill="${CORAL}" stroke="${CORAL}" stroke-width="0.8" stroke-linejoin="round"/>
  </g>`;
}

const png = (svg, w, h = w) => sharp(Buffer.from(svg)).resize(w, h).png().toBuffer();

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

for (const [d, f] of Object.entries(DENSITIES)) {
  const legacy = Math.round(48 * f);
  const fg = Math.round(108 * f);
  const dir = join(res, `mipmap-${d}`);
  await writeFile(
    join(dir, "ic_launcher.png"),
    await png(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${legacy} ${legacy}"><rect width="${legacy}" height="${legacy}" rx="${legacy * 0.2}" fill="${FOREST}"/>${mark(legacy, 0.6)}</svg>`, legacy),
  );
  await writeFile(
    join(dir, "ic_launcher_round.png"),
    await png(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${legacy} ${legacy}"><circle cx="${legacy / 2}" cy="${legacy / 2}" r="${legacy / 2}" fill="${FOREST}"/>${mark(legacy, 0.52)}</svg>`, legacy),
  );
  // Adaptive icon foreground: 108dp canvas, keep the art inside the 66dp safe zone.
  await writeFile(join(dir, "ic_launcher_foreground.png"), await png(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fg} ${fg}">${mark(fg, 0.42)}</svg>`, fg));
}

await writeFile(join(res, "values", "ic_launcher_background.xml"), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${FOREST}</color>\n</resources>\n`);

const dirs = (await readdir(res)).filter((n) => n.startsWith("drawable"));
for (const name of dirs) {
  const file = join(res, name, "splash.png");
  let meta;
  try {
    meta = await sharp(file).metadata();
  } catch {
    continue;
  }
  const { width: w, height: h } = meta;
  const s = Math.min(w, h) * 0.34;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${CREAM}"/>
    <g transform="translate(${(w - s) / 2} ${(h - s) / 2})"><rect width="${s}" height="${s}" rx="${s * 0.22}" fill="${FOREST}"/>${mark(s, 0.6)}</g></svg>`;
  await writeFile(file, await png(svg, w, h));
}
console.log("Android icons and splash screens updated.");
