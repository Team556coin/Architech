import type { Look } from "./schemas";

export interface LookPreset {
  id: string;
  label: string;
  /** Plain description of the boards, used when talking to the image model. */
  prompt: string;
  /** Close-up swatch of the boards. Our own drawing, not a photo. */
  svg: string;
}

const W = 640;
const H = 480;

function svg(body: string, background: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="${background}"/>${body}</svg>`;
}

function grain(x: number, y: number, bw: number, bh: number): string {
  const x1 = x + bw * 0.32;
  const x2 = x + bw * 0.55;
  return `<line x1="${x1.toFixed(1)}" y1="${y + 8}" x2="${(x1 + bw * 0.06).toFixed(1)}" y2="${y + bh - 8}" stroke="#000" stroke-opacity="0.15" stroke-width="2"/><line x1="${x2.toFixed(1)}" y1="${y + 20}" x2="${(x2 - bw * 0.04).toFixed(1)}" y2="${y + bh - 16}" stroke="#000" stroke-opacity="0.1" stroke-width="1.5"/>`;
}

/** Vertical boards. tops: dog-ear cuts the top corners, point makes a picket, flat is square. */
function verticalBoards(opts: { tops: "dog-ear" | "flat" | "point"; gap: number; count: number; fill: (i: number) => string; background: string }): string {
  const gap = opts.gap;
  const bw = (W - gap * (opts.count + 1)) / opts.count;
  let body = "";
  for (let i = 0; i < opts.count; i++) {
    const x = gap + i * (bw + gap);
    const y = opts.tops === "point" ? 24 : 28;
    const bottom = H - 16;
    const fill = opts.fill(i);
    if (opts.tops === "flat") {
      body += `<rect x="${x.toFixed(1)}" y="${y}" width="${bw.toFixed(1)}" height="${bottom - y}" fill="${fill}" rx="1"/>`;
    } else if (opts.tops === "dog-ear") {
      const ear = Math.min(22, bw * 0.32);
      body += `<polygon points="${x.toFixed(1)},${y + ear} ${(x + ear).toFixed(1)},${y} ${(x + bw - ear).toFixed(1)},${y} ${(x + bw).toFixed(1)},${y + ear} ${(x + bw).toFixed(1)},${bottom} ${x.toFixed(1)},${bottom}" fill="${fill}"/>`;
    } else {
      body += `<polygon points="${(x + bw / 2).toFixed(1)},${y} ${(x + bw).toFixed(1)},${y + 52} ${(x + bw).toFixed(1)},${bottom} ${x.toFixed(1)},${bottom} ${x.toFixed(1)},${y + 52}" fill="${fill}"/>`;
    }
    body += grain(x, y, bw, bottom - y);
  }
  return svg(body, opts.background);
}

const cedar = (i: number) => ["#C4A06A", "#B8895A", "#D2B48C", "#A97449", "#C9A27A", "#8C5A32"][i % 6]!;

const FENCE_LOOKS: LookPreset[] = [
  {
    id: "dog-ear",
    label: "Dog-ear",
    prompt: "natural cedar dog-ear privacy boards, vertical, each board with the angled dog-ear cut on top and a narrow gap between boards",
    svg: verticalBoards({ tops: "dog-ear", gap: 6, count: 8, fill: cedar, background: "#6E7268" }),
  },
  {
    id: "flat-top",
    label: "Flat top",
    prompt: "natural cedar flat-top privacy boards, vertical, square tops, set tight together with almost no gap",
    svg: verticalBoards({ tops: "flat", gap: 3, count: 9, fill: cedar, background: "#6E7268" }),
  },
  {
    id: "board-batten",
    label: "Board & batten",
    prompt: "cedar board-and-batten, wide vertical boards with a narrower darker batten covering each seam",
    svg: (() => {
      const count = 5;
      const gap = 0;
      const bw = W / count;
      let body = "";
      for (let i = 0; i < count; i++) {
        const x = i * bw;
        body += `<rect x="${x}" y="20" width="${bw + 1}" height="${H - 36}" fill="${cedar(i)}"/>`;
        body += grain(x, 20, bw, H - 36);
      }
      const batten = 18;
      for (let i = 0; i <= count; i++) {
        const x = i * bw - batten / 2;
        body += `<rect x="${x}" y="20" width="${batten}" height="${H - 36}" fill="#6B4423"/>`;
      }
      return svg(body, "#6E7268");
    })(),
  },
  {
    id: "horizontal",
    label: "Horizontal",
    prompt: "modern cedar horizontal slats with an even gap between each slat",
    svg: (() => {
      const gap = 14;
      const count = 9;
      const bh = (H - gap * (count + 1)) / count;
      let body = "";
      for (let i = 0; i < count; i++) {
        const y = gap + i * (bh + gap);
        body += `<rect x="16" y="${y.toFixed(1)}" width="${W - 32}" height="${bh.toFixed(1)}" fill="${cedar(i)}" rx="1"/>`;
        body += `<line x1="40" y1="${(y + bh * 0.45).toFixed(1)}" x2="${W - 40}" y2="${(y + bh * 0.55).toFixed(1)}" stroke="#000" stroke-opacity="0.12" stroke-width="2"/>`;
      }
      return svg(body, "#5C6158");
    })(),
  },
  {
    id: "picket",
    label: "Picket",
    prompt: "white painted picket boards with pointed tops and an even gap between each picket, on a simple rail",
    svg: (() => {
      const gap = 22;
      const count = 9;
      const bw = (W - gap * (count + 1)) / count;
      let body = `<rect x="0" y="150" width="${W}" height="22" fill="#E4E0D6"/><rect x="0" y="300" width="${W}" height="22" fill="#E4E0D6"/>`;
      for (let i = 0; i < count; i++) {
        const x = gap + i * (bw + gap);
        body += `<polygon points="${(x + bw / 2).toFixed(1)},24 ${(x + bw).toFixed(1)},76 ${(x + bw).toFixed(1)},${H - 16} ${x.toFixed(1)},${H - 16} ${x.toFixed(1)},76" fill="#F4F1EA"/>`;
      }
      return svg(body, "#7D8A72");
    })(),
  },
];

const BY_ITEM: Record<string, LookPreset[]> = { fence: FENCE_LOOKS };

export function looksFor(itemType: string): LookPreset[] {
  return BY_ITEM[itemType] ?? [];
}

export function getLook(itemType: string, presetId: string | undefined): LookPreset | undefined {
  const list = looksFor(itemType);
  return list.find((p) => p.id === presetId) ?? list[0];
}

/** Short label for the materials list. */
export function lookLabel(itemType: string, look: Look | undefined): string | undefined {
  if (!looksFor(itemType).length) return undefined;
  if (!look || look.source === "existing") return "Match the fence in the photo";
  if (look.source === "photo") return "Your photo";
  return getLook(itemType, look.presetId)?.label;
}
