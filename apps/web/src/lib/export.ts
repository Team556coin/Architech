import { canvasToBlob, loadImage } from "./images";
import type { DrawingOverlay } from "./measure-view";
import { isNative, shareNativeImage } from "./native";

/** The picture with the dimension lines burned in, for "Download with measurements". */
export async function renderMeasured(src: string, overlays: DrawingOverlay[]): Promise<Blob> {
  const img = await loadImage(src);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const s = Math.max(W, H) / 1000;
  for (const o of overlays) {
    for (const l of o.lines) {
      const ax = l.a.x * W;
      const ay = l.a.y * H;
      const bx = l.b.x * W;
      const by = l.b.y * H;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3 * s;
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = 4 * s;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      for (const [px, py, qx, qy] of [
        [ax, ay, bx, by],
        [bx, by, ax, ay],
      ] as const) {
        const ang = Math.atan2(py - qy, px - qx);
        const len = 12 * s;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - len * Math.cos(ang - 0.45), py - len * Math.sin(ang - 0.45));
        ctx.moveTo(px, py);
        ctx.lineTo(px - len * Math.cos(ang + 0.45), py - len * Math.sin(ang + 0.45));
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      ctx.font = `700 ${Math.round(16 * s)}px Nunito, system-ui, sans-serif`;
      const tw = ctx.measureText(l.text).width;
      const ph = 26 * s;
      const pw = tw + 18 * s;
      ctx.fillStyle = "rgba(29,42,36,0.88)";
      ctx.beginPath();
      ctx.roundRect(mx - pw / 2, my - ph / 2, pw, ph, 8 * s);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(l.text, mx, my + 1 * s);
    }
  }
  return canvasToBlob(canvas, "image/jpeg", 0.92);
}

export async function saveImage(blob: Blob, fileName: string) {
  if (isNative()) return shareNativeImage(blob, fileName, "Save your design");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function shareImage(blob: Blob, fileName: string, title: string): Promise<"shared" | "downloaded"> {
  if (isNative()) {
    await shareNativeImage(blob, fileName, title);
    return "shared";
  }
  const file = new File([blob], fileName, { type: blob.type || "image/jpeg" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text: "Made with HomeRedo" });
      return "shared";
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return "shared";
    }
  }
  await saveImage(blob, fileName);
  return "downloaded";
}

export const fileNameFor = (title: string, label: string, opts: { measured?: boolean } = {}) =>
  `${`${title}-${label}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "home-redo"}${opts.measured ? "-measurements" : ""}.jpg`;
