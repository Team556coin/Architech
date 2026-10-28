// Renders the app icons (PWA, Apple, favicon, Android source) from the logo.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "icons");

// House outline with a clockwise "redo" arrow inside, on a 32x32 grid.
const mark = (scale) => {
  const k = (scale * 1024) / 32;
  return `<g transform="translate(${512 - 16 * k} ${512 - 16.5 * k}) scale(${k})">
    <path d="M4 15 16 4.5 28 15v12a1.5 1.5 0 0 1-1.5 1.5h-21A1.5 1.5 0 0 1 4 27z" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M20.5 17.4A5.2 5.2 0 1 1 14.22 15.11" fill="none" stroke="#F07A5A" stroke-width="2.8" stroke-linecap="round"/>
    <path d="M13.2 12.29 17.79 13.81 15.25 17.93z" fill="#F07A5A" stroke="#F07A5A" stroke-width="0.8" stroke-linejoin="round"/>
  </g>`;
};

const svg = ({ rounded, scale }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="${rounded ? 224 : 0}" fill="#1F4D3A"/>
  ${mark(scale)}
</svg>`;

const targets = [
  { file: "icon-192.png", size: 192, rounded: true, scale: 0.62 },
  { file: "icon-512.png", size: 512, rounded: true, scale: 0.62 },
  { file: "maskable-512.png", size: 512, rounded: false, scale: 0.5 },
  { file: "apple-touch-icon.png", size: 180, rounded: false, scale: 0.6 },
  { file: "favicon-32.png", size: 32, rounded: true, scale: 0.7 },
  { file: "android-source-1024.png", size: 1024, rounded: false, scale: 0.5 },
];

await mkdir(out, { recursive: true });
for (const t of targets) {
  const png = await sharp(Buffer.from(svg(t))).resize(t.size, t.size).png().toBuffer();
  await writeFile(join(out, t.file), png);
  console.log("wrote", t.file);
}
await writeFile(join(out, "icon.svg"), svg({ rounded: true, scale: 0.62 }));
