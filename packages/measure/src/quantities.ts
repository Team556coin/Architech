import { getItem, type ChoiceOption, type Units } from "@architech/core";
import type { ItemMeasure } from "./items";
import { formatArea, formatLength, formatVolume } from "./units";

export interface QuantityRow {
  label: string;
  value: string;
}

const FT = 0.3048;
const IN = 0.0254;
const SQFT = FT * FT;

type Options = Record<string, string | boolean>;

function choiceLabel(itemType: string, options: Options, id: string): string | undefined {
  const opt = getItem(itemType).options.find((o): o is ChoiceOption => o.type === "choice" && o.id === id);
  if (!opt) return undefined;
  const v = (options[id] as string | undefined) ?? opt.default;
  return opt.choices.find((c) => c.id === v)?.label;
}

const toggleOn = (itemType: string, options: Options, id: string) => {
  const opt = getItem(itemType).options.find((o) => o.id === id);
  return (options[id] ?? opt?.default) === true;
};

/** "What you're getting" rows for one drawn item. */
export function quantitiesFor(itemType: string, m: ItemMeasure, options: Options, units: Units, boards?: string): QuantityRow[] {
  const item = getItem(itemType);
  const inch = !!item.preferInches;
  const L = (v: number | undefined, exact: boolean | undefined, preferInches = inch) =>
    v === undefined ? undefined : formatLength(v, units, { estimated: !exact, preferInches });
  const areaExact = m.lengthExact && (m.widthExact ?? false);
  const rows: QuantityRow[] = [];
  const add = (label: string, value: string | undefined) => {
    if (value) rows.push({ label, value });
  };
  const size = () => {
    if (m.lengthM === undefined || m.widthM === undefined) return undefined;
    return `${formatLength(m.lengthM, units, { preferInches: inch })} x ${formatLength(m.widthM, units, { preferInches: inch })}`;
  };
  const sizeRow = (label = "Size") => add(label, size() && (areaExact ? size() : `≈ ${size()}`));

  switch (itemType) {
    case "fence":
    case "garden-wall":
    case "hedge":
    case "interior-wall": {
      add("Total length", L(m.lengthM, m.lengthExact, false));
      add("Height", L(m.heightM, m.heightExact, false));
      if (itemType === "fence") {
        const panelW = 8 * FT;
        const panels = m.runsM.reduce((s, r) => s + Math.max(1, Math.ceil(r / panelW - 1e-6)), 0);
        add("Panels", `${formatLength(panelW, units)} wide x ${panels}`);
        add("Posts", String(panels + 1));
      }
      if (boards) add("Boards", boards);
      const mat = [choiceLabel(itemType, options, "material"), choiceLabel(itemType, options, "style"), choiceLabel(itemType, options, "plant")].filter(Boolean);
      if (mat.length) add("Material", mat.join(", "));
      if (itemType === "interior-wall" && m.lengthM && m.heightM) add("Drywall (both sides)", formatArea(m.lengthM * m.heightM * 2, units, true));
      break;
    }
    case "path": {
      add("Length", L(m.lengthM, m.lengthExact, false));
      add("Width", L(m.widthM, m.widthExact, false));
      if (m.areaM2) add("Area", formatArea(m.areaM2, units, !m.lengthExact));
      add("Material", choiceLabel(itemType, options, "material"));
      break;
    }
    case "pool": {
      sizeRow();
      if (m.areaM2) add("Water area", formatArea(m.areaM2, units, !areaExact));
      if (m.depthM) add("Depth", L(m.depthM, true, false));
      if (m.perimeterM) add("Coping", formatLength(m.perimeterM, units, { estimated: true }));
      add("Finish", choiceLabel(itemType, options, "finish"));
      break;
    }
    case "fire-pit": {
      add("Across", L(m.diameterM ?? m.lengthM, m.lengthExact, false));
      if (m.areaM2) add("Area", formatArea(m.areaM2, units, !areaExact));
      const d = m.diameterM ?? m.lengthM;
      if (d && choiceLabel(itemType, options, "seating") !== "None") add("Seats about", String(Math.max(2, Math.round((Math.PI * (d / FT)) / 4.5))));
      add("Style", choiceLabel(itemType, options, "style"));
      break;
    }
    case "flower-bed": {
      sizeRow();
      if (m.areaM2) add("Area", formatArea(m.areaM2, units, !areaExact));
      if (m.perimeterM) add("Edging", formatLength(m.perimeterM, units, { estimated: true }));
      if (m.areaM2) add("Mulch (3 in deep)", formatVolume(m.areaM2 * 3 * IN, units, true));
      const plants = m.areaM2 ? Math.max(1, Math.round(m.areaM2 / SQFT / 6)) : undefined;
      if (plants) add("Plants", `about ${plants}`);
      break;
    }
    case "walk-in-shower": {
      sizeRow("Shower size");
      const door = choiceLabel(itemType, options, "door");
      if (door) add("Glass", m.heightM && door !== "No door" ? `${door}, ${formatLength(m.heightM, units, { preferInches: true })} tall` : door);
      if (m.lengthM && m.widthM && m.heightM) {
        const tile = (m.lengthM * m.widthM + m.lengthM * m.heightM + m.widthM * m.heightM) * 1.1;
        add("Tile (with 10% extra)", formatArea(tile, units, true));
      }
      add("Tile style", choiceLabel(itemType, options, "tile"));
      if (toggleOn(itemType, options, "bench")) add("Bench", `${formatLength(18 * IN, units)} high`);
      if (toggleOn(itemType, options, "niche")) add("Niche", units === "metric" ? "60 x 30 cm" : "24 x 12 in");
      break;
    }
    default: {
      sizeRow();
      if (m.areaM2 && item.kind === "area") add("Area", formatArea(m.areaM2, units, !areaExact));
      if (item.tall) add("Height", L(m.heightM, m.heightExact));
      if (itemType === "deck" && toggleOn(itemType, options, "steps")) add("Steps", "Yes");
      const mat = choiceLabel(itemType, options, "material") ?? choiceLabel(itemType, options, "style") ?? choiceLabel(itemType, options, "top");
      add("Material", mat);
    }
  }
  return rows;
}
