import type { Units } from "@architech/core";

const IN = 0.0254;
const FT = 0.3048;
const CU_YD = 0.764554857984;

const num = (n: number, digits = 0) => n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
const approx = (s: string, estimated?: boolean) => (estimated ? `≈ ${s}` : s);

export interface LengthFormat {
  preferInches?: boolean;
  estimated?: boolean;
}

export function formatLength(m: number, units: Units, opts: LengthFormat = {}): string {
  if (units === "metric") {
    let s: string;
    if (m < 1) s = `${num(m * 100)} cm`;
    else if (m < 10) s = `${num(m, 2)} m`;
    else s = `${num(m, 1)} m`;
    return approx(s, opts.estimated);
  }
  const totalIn = m / IN;
  let s: string;
  if ((opts.preferInches && totalIn < 120) || totalIn < 24) {
    s = `${num(Math.round(totalIn))} in`;
  } else if (totalIn >= 240) {
    s = `${num(Math.round(totalIn / 12))} ft`;
  } else {
    let ft = Math.floor(totalIn / 12);
    let inch = Math.round(totalIn - ft * 12);
    if (inch === 12) {
      ft += 1;
      inch = 0;
    }
    s = inch === 0 ? `${ft} ft` : `${ft} ft ${inch} in`;
  }
  return approx(s, opts.estimated);
}

export function formatArea(m2: number, units: Units, estimated?: boolean): string {
  if (units === "metric") return approx(`${num(m2, 1)} m²`, estimated);
  return approx(`${num(Math.round(m2 / (FT * FT)))} sq ft`, estimated);
}

export function formatVolume(m3: number, units: Units, estimated?: boolean): string {
  if (units === "metric") return approx(`${num(m3, 1)} m³`, estimated);
  return approx(`${num(m3 / CU_YD, 1)} cu yd`, estimated);
}

const N = "(\\d+(?:\\.\\d+)?)";
const FEET = "(?:ft|feet|foot|')";
const INCH = "(?:in|inch|inches|\")";

/** Parse what a person types ("9 ft 2 in", "9'2", "60in", "2.5 m", "6") into meters. */
export function parseLength(text: string, units: Units): number | null {
  const t = text.trim().toLowerCase().replace(/(\d),(\d)/g, "$1.$2").replace(/\s+/g, " ");
  if (!t) return null;
  let m: RegExpMatchArray | null;
  let v: number | null = null;
  if ((m = t.match(new RegExp(`^${N} ?${FEET} ?(?:${N} ?${INCH}?)?$`)))) v = Number(m[1]) * FT + (m[2] ? Number(m[2]) * IN : 0);
  else if ((m = t.match(new RegExp(`^${N} ?${INCH}$`)))) v = Number(m[1]) * IN;
  else if ((m = t.match(new RegExp(`^${N} ?cm$`)))) v = Number(m[1]) / 100;
  else if ((m = t.match(new RegExp(`^${N} ?(?:m|meter|meters|metre|metres)$`)))) v = Number(m[1]);
  else if ((m = t.match(new RegExp(`^${N}$`)))) v = units === "metric" ? Number(m[1]) : Number(m[1]) * FT;
  if (v === null || !Number.isFinite(v) || v <= 0) return null;
  return v;
}

export const metersToFeet = (m: number) => m / FT;
export const feetToMeters = (ft: number) => ft * FT;
export const inchesToMeters = (i: number) => i * IN;
