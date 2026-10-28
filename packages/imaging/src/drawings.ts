import { colorForNumber, getItem, type Drawing, type Point } from "@architech/core";
import sharp from "sharp";

const f = (n: number) => Math.round(n * 10) / 10;
const pts = (p: Point[], W: number, H: number) => p.map((q) => `${f(q.x * W)},${f(q.y * H)}`).join(" ");
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export interface MarkOptions {
  /** Normalized image-y of the top of a standing item, keyed by drawing id. One value per base point. */
  tops?: Record<string, number[]>;
  /** Silhouettes that stay in front of a new structure, punched out of the edit mask. */
  occluders?: Point[][];
}

/** Top of a standing item at each base point. `pad` lets the edit zone rise a little above the true top. */
function standingTop(d: Drawing, tops: Record<string, number[]> | undefined, pad: number): Point[] | null {
  if (!getItem(d.itemType).tall || d.zoneHeight <= 0 || d.points.length < 2) return null;
  const ys = tops?.[d.id];
  const useYs = !!ys && ys.length === d.points.length;
  return d.points.map((p, i) => {
    const raw = useYs ? ys[i]! : p.y - d.zoneHeight;
    const lift = Math.max(0, p.y - raw) * pad;
    return { x: p.x, y: clamp01(p.y - lift) };
  });
}

/** The zone (in pixels) a drawing allows the AI to change, as SVG elements filled white. */
function zoneElements(d: Drawing, W: number, H: number, margin: number, tops?: Record<string, number[]>): string {
  const out: string[] = [];
  const stroke = `stroke="#fff" stroke-width="${f(margin * 2)}" stroke-linejoin="round" stroke-linecap="round"`;
  if (d.kind === "brush") {
    for (const s of d.strokes ?? []) {
      const color = s.erase ? "#000" : "#fff";
      const width = f(s.size * W);
      if (s.points.length === 1) {
        const p = s.points[0]!;
        out.push(`<circle cx="${f(p.x * W)}" cy="${f(p.y * H)}" r="${f(width / 2)}" fill="${color}"/>`);
      } else {
        out.push(`<polyline points="${pts(s.points, W, H)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`);
      }
    }
    return out.join("");
  }
  const raised = standingTop(d, tops, 1.08);
  if (d.kind === "line") {
    const lineWidth = Math.max(margin * 2, getItem(d.itemType).tall ? margin * 2 : 0.04 * W);
    out.push(`<polyline points="${pts(d.points, W, H)}" fill="none" stroke="#fff" stroke-width="${f(lineWidth)}" stroke-linecap="round" stroke-linejoin="round"/>`);
    if (raised) {
      for (let i = 1; i < d.points.length; i++) {
        const quad = [d.points[i - 1]!, d.points[i]!, raised[i]!, raised[i - 1]!];
        out.push(`<polygon points="${pts(quad, W, H)}" fill="#fff" ${stroke}/>`);
      }
    }
    return out.join("");
  }
  out.push(`<polygon points="${pts(d.points, W, H)}" fill="#fff" ${stroke}/>`);
  if (raised) {
    out.push(`<polygon points="${pts(raised, W, H)}" fill="#fff" ${stroke}/>`);
    for (let i = 0; i < d.points.length; i++) {
      const j = (i + 1) % d.points.length;
      const quad = [d.points[i]!, d.points[j]!, raised[j]!, raised[i]!];
      out.push(`<polygon points="${pts(quad, W, H)}" fill="#fff" ${stroke}/>`);
    }
  }
  return out.join("");
}

function occluderElements(occluders: Point[][], W: number, H: number): string {
  const sw = f(0.02 * Math.max(W, H));
  return occluders
    .filter((p) => p.length >= 3)
    .map((p) => `<polygon points="${pts(p, W, H)}" fill="#000" stroke="#000" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`)
    .join("");
}

export function maskSvg(drawings: Drawing[], W: number, H: number, opts: MarkOptions = {}): string {
  if (!drawings.length) return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fff"/></svg>`;
  const margin = Math.max(4, 0.015 * Math.max(W, H));
  const body = drawings.map((d) => zoneElements(d, W, H, margin, opts.tops)).join("");
  const holes = occluderElements(opts.occluders ?? [], W, H);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#000"/>${body}${holes}</svg>`;
}

/** Grayscale PNG: white where the AI may change pixels, black where the photo must stay as is. */
export async function renderMask(drawings: Drawing[], W: number, H: number, opts: MarkOptions = {}): Promise<Buffer> {
  return sharp(Buffer.from(maskSvg(drawings, W, H, opts)))
    .resize(W, H, { fit: "fill" })
    .flatten({ background: "#000" })
    .grayscale()
    .threshold(128)
    .png()
    .toBuffer();
}

function guideElements(d: Drawing, W: number, H: number, tops?: Record<string, number[]>): string {
  const { hex } = colorForNumber(d.number);
  const sw = f(Math.max(4, 0.007 * Math.max(W, H)));
  const halo = f(Number(sw) + 4);
  if (d.kind === "brush") {
    return (d.strokes ?? [])
      .filter((s) => !s.erase)
      .map(
        (s) =>
          `<polyline points="${pts(s.points, W, H)}" fill="none" stroke="${hex}" stroke-opacity="0.55" stroke-width="${f(s.size * W)}" stroke-linecap="round" stroke-linejoin="round"/>`,
      )
      .join("");
  }
  const p = pts(d.points, W, H);
  const raised = standingTop(d, tops, 1);
  const tag = d.kind === "line" ? "polyline" : "polygon";
  const fill = d.kind === "line" ? "none" : hex;
  const dots = d.points.map((q) => `<circle cx="${f(q.x * W)}" cy="${f(q.y * H)}" r="${f(Number(sw) * 0.9)}" fill="#fff" stroke="${hex}" stroke-width="2"/>`).join("");
  let height = "";
  if (raised) {
    const top = pts(raised, W, H);
    const verts = d.points
      .map((q, i) => {
        const t = raised[i]!;
        return `<line x1="${f(q.x * W)}" y1="${f(q.y * H)}" x2="${f(t.x * W)}" y2="${f(t.y * H)}" stroke="${hex}" stroke-width="${sw}" stroke-linecap="round"/>`;
      })
      .join("");
    const face = d.kind === "line" ? `<polygon points="${pts([...d.points, ...[...raised].reverse()], W, H)}" fill="${hex}" fill-opacity="0.22" stroke="none"/>` : "";
    height =
      face +
      `<polyline points="${top}" fill="none" stroke="#fff" stroke-width="${halo}" stroke-linejoin="round" stroke-linecap="round"/>` +
      `<polyline points="${top}" fill="none" stroke="${hex}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>` +
      verts;
  }
  const groundSw = raised && d.kind === "line" ? f(Number(sw) * 2.2) : sw;
  const groundHalo = raised && d.kind === "line" ? f(Number(groundSw) + 5) : halo;
  return (
    height +
    `<${tag} points="${p}" fill="none" stroke="#fff" stroke-width="${groundHalo}" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<${tag} points="${p}" fill="${fill}" fill-opacity="0.28" stroke="${hex}" stroke-width="${groundSw}" stroke-linejoin="round" stroke-linecap="round"/>` +
    dots
  );
}

/** A copy of the photo with each drawing in its color, sent to the AI as a placement guide. */
export async function renderGuide(photo: Buffer, drawings: Drawing[], opts: MarkOptions = {}): Promise<Buffer> {
  const meta = await sharp(photo).metadata();
  const W = meta.width!;
  const H = meta.height!;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${drawings.map((d) => guideElements(d, W, H, opts.tops)).join("")}</svg>`;
  return sharp(photo)
    .composite([{ input: Buffer.from(svg) }])
    .jpeg({ quality: 92 })
    .toBuffer();
}
