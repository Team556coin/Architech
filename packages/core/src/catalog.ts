import { isOutdoor, type SpaceType } from "./schemas";

export type ItemKind = "line" | "area" | "brush";
export type ItemScope = "indoor" | "outdoor" | "both";

export interface ChoiceOption {
  type: "choice";
  id: string;
  label: string;
  choices: { id: string; label: string; prompt?: string; heightM?: number }[];
  default: string;
}
export interface ToggleOption {
  type: "toggle";
  id: string;
  label: string;
  prompt: string;
  default: boolean;
}
export type ItemOption = ChoiceOption | ToggleOption;

export interface CatalogItem {
  id: string;
  label: string;
  /** lucide-react icon name */
  icon: string;
  kind: ItemKind;
  scope: ItemScope;
  /** Only offered in these spaces (and "other"); everywhere in its scope when unset. */
  spaces?: SpaceType[];
  /** Tall items get an edit zone that extends upward from the drawing. */
  tall: boolean;
  defaultHeightM?: number;
  /** Default footprint for ready-made shapes (width x depth, meters). */
  defaultSize?: { widthM: number; depthM: number };
  defaultShape?: "rect" | "ellipse";
  /** Show small sizes in inches (fixtures) rather than feet. */
  preferInches?: boolean;
  /** What the user is told to do on the photo. */
  hint: string;
  /** Noun used in prompts. */
  noun: string;
  options: ItemOption[];
}

const FT = 0.3048;
const IN = 0.0254;

const choice = (id: string, label: string, values: [string, string, string][]): ChoiceOption => ({
  type: "choice", id, label, default: values[0]![0],
  choices: values.map(([id, label, prompt]) => ({ id, label, prompt })),
});

const outdoorStructure = (id: string, label: string, icon: string, width: number, depth: number, height: number, options: ItemOption[] = []): CatalogItem => ({
  id, label, icon, kind: "area", scope: "outdoor", tall: true,
  defaultHeightM: height * FT, defaultSize: { widthM: width * FT, depthM: depth * FT }, defaultShape: "rect",
  hint: `Place the ${label.toLowerCase()} on the ground. Drag the corners to fit.`,
  noun: label.toLowerCase(), options,
});

const fenceHeights = [
  { id: "4ft", label: "4 ft", prompt: "4 ft tall", heightM: 4 * FT },
  { id: "6ft", label: "6 ft", prompt: "6 ft tall", heightM: 6 * FT },
  { id: "8ft", label: "8 ft", prompt: "8 ft tall", heightM: 8 * FT },
];

export const CATALOG: CatalogItem[] = [
  // Outdoor lines
  {
    id: "fence",
    label: "Fence",
    icon: "Fence",
    kind: "line",
    scope: "outdoor",
    tall: true,
    defaultHeightM: 6 * FT,
    hint: "Click along where the fence goes. Double-click to finish.",
    noun: "fence",
    options: [
      { type: "choice", id: "height", label: "Height", choices: fenceHeights, default: "6ft" },
    ],
  },
  {
    id: "garden-wall",
    label: "Wall",
    icon: "BrickWall",
    kind: "line",
    scope: "outdoor",
    tall: true,
    defaultHeightM: 3 * FT,
    hint: "Click along where the wall goes. Double-click to finish.",
    noun: "garden wall",
    options: [
      {
        type: "choice",
        id: "height",
        label: "Height",
        choices: [
          { id: "2ft", label: "2 ft", prompt: "2 ft tall", heightM: 2 * FT },
          { id: "3ft", label: "3 ft", prompt: "3 ft tall", heightM: 3 * FT },
          { id: "4ft", label: "4 ft", prompt: "4 ft tall", heightM: 4 * FT },
        ],
        default: "3ft",
      },
      {
        type: "choice",
        id: "material",
        label: "Material",
        choices: [
          { id: "stone", label: "Stone", prompt: "natural stacked stone" },
          { id: "block", label: "Block", prompt: "tan retaining wall block" },
          { id: "brick", label: "Brick", prompt: "red brick" },
        ],
        default: "stone",
      },
    ],
  },
  {
    id: "hedge",
    label: "Hedge",
    icon: "TreeDeciduous",
    kind: "line",
    scope: "outdoor",
    tall: true,
    defaultHeightM: 4 * FT,
    hint: "Click along where the hedge goes. Double-click to finish.",
    noun: "hedge",
    options: [
      {
        type: "choice",
        id: "height",
        label: "Height",
        choices: [
          { id: "3ft", label: "3 ft", prompt: "3 ft tall", heightM: 3 * FT },
          { id: "5ft", label: "5 ft", prompt: "5 ft tall", heightM: 5 * FT },
          { id: "8ft", label: "8 ft", prompt: "8 ft tall", heightM: 8 * FT },
        ],
        default: "5ft",
      },
      {
        type: "choice",
        id: "plant",
        label: "Plant",
        choices: [
          { id: "boxwood", label: "Boxwood", prompt: "neatly trimmed boxwood" },
          { id: "arborvitae", label: "Arborvitae", prompt: "arborvitae" },
          { id: "privet", label: "Privet", prompt: "privet" },
        ],
        default: "boxwood",
      },
    ],
  },
  {
    id: "path",
    label: "Path",
    icon: "Footprints",
    kind: "line",
    scope: "outdoor",
    tall: false,
    hint: "Click along where the path goes. Double-click to finish.",
    noun: "garden path",
    options: [
      {
        type: "choice",
        id: "width",
        label: "Width",
        choices: [
          { id: "2ft", label: "2 ft", prompt: "2 ft wide" },
          { id: "3ft", label: "3 ft", prompt: "3 ft wide" },
          { id: "4ft", label: "4 ft", prompt: "4 ft wide" },
        ],
        default: "3ft",
      },
      {
        type: "choice",
        id: "material",
        label: "Material",
        choices: [
          { id: "flagstone", label: "Flagstone", prompt: "flagstone" },
          { id: "pavers", label: "Pavers", prompt: "concrete pavers" },
          { id: "gravel", label: "Gravel", prompt: "pea gravel with steel edging" },
        ],
        default: "flagstone",
      },
    ],
  },
  // Outdoor areas
  {
    id: "pool",
    label: "Pool",
    icon: "Waves",
    kind: "area",
    scope: "outdoor",
    tall: false,
    defaultSize: { widthM: 28 * FT, depthM: 14 * FT },
    defaultShape: "rect",
    hint: "Draw around where the pool goes.",
    noun: "in-ground swimming pool",
    options: [
      {
        type: "choice",
        id: "shape",
        label: "Shape",
        choices: [
          { id: "rectangle", label: "Rectangle", prompt: "rectangular" },
          { id: "freeform", label: "Freeform", prompt: "freeform curved" },
        ],
        default: "rectangle",
      },
      {
        type: "choice",
        id: "finish",
        label: "Finish",
        choices: [
          { id: "pebble-blue", label: "Pebble blue", prompt: "pebble blue finish with light stone coping" },
          { id: "white-plaster", label: "White plaster", prompt: "white plaster finish with concrete coping" },
          { id: "dark", label: "Dark lagoon", prompt: "dark lagoon finish with travertine coping" },
        ],
        default: "pebble-blue",
      },
    ],
  },
  {
    id: "deck",
    label: "Deck",
    icon: "LayoutPanelTop",
    kind: "area",
    scope: "outdoor",
    tall: false,
    defaultSize: { widthM: 16 * FT, depthM: 12 * FT },
    defaultShape: "rect",
    hint: "Draw around where the deck goes.",
    noun: "deck",
    options: [
      {
        type: "choice",
        id: "material",
        label: "Material",
        choices: [
          { id: "composite", label: "Composite", prompt: "gray composite decking" },
          { id: "cedar", label: "Cedar", prompt: "natural cedar decking" },
        ],
        default: "composite",
      },
      { type: "toggle", id: "steps", label: "Steps", prompt: "wide steps down to the ground", default: true },
      { type: "toggle", id: "railing", label: "Railing", prompt: "a matching railing", default: false },
    ],
  },
  {
    id: "patio",
    label: "Patio",
    icon: "Grid3x3",
    kind: "area",
    scope: "outdoor",
    tall: false,
    defaultSize: { widthM: 14 * FT, depthM: 12 * FT },
    defaultShape: "rect",
    hint: "Draw around where the patio goes.",
    noun: "patio",
    options: [
      {
        type: "choice",
        id: "material",
        label: "Material",
        choices: [
          { id: "pavers", label: "Pavers", prompt: "interlocking concrete pavers" },
          { id: "flagstone", label: "Flagstone", prompt: "natural flagstone" },
          { id: "concrete", label: "Concrete", prompt: "smooth stamped concrete" },
        ],
        default: "pavers",
      },
    ],
  },
  {
    id: "fire-pit",
    label: "Fire pit",
    icon: "Flame",
    kind: "area",
    scope: "outdoor",
    tall: false,
    defaultSize: { widthM: 12 * FT, depthM: 12 * FT },
    defaultShape: "ellipse",
    hint: "Draw around where the fire pit area goes.",
    noun: "fire pit area",
    options: [
      {
        type: "choice",
        id: "style",
        label: "Style",
        choices: [
          { id: "sunken", label: "Sunken", prompt: "sunken about 18 in below the ground" },
          { id: "raised", label: "Raised", prompt: "with a raised stone fire ring at ground level" },
        ],
        default: "sunken",
      },
      {
        type: "choice",
        id: "seating",
        label: "Seating",
        choices: [
          { id: "stone-bench", label: "Stone bench", prompt: "a built-in curved stone bench" },
          { id: "chairs", label: "Chairs", prompt: "Adirondack chairs" },
          { id: "none", label: "None", prompt: "" },
        ],
        default: "stone-bench",
      },
    ],
  },
  {
    id: "flower-bed",
    label: "Flower bed",
    icon: "Flower2",
    kind: "area",
    scope: "outdoor",
    tall: false,
    defaultSize: { widthM: 12 * FT, depthM: 4 * FT },
    defaultShape: "rect",
    hint: "Draw around where the flower bed goes.",
    noun: "flower bed",
    options: [
      {
        type: "choice",
        id: "plants",
        label: "Plants",
        choices: [
          { id: "colorful", label: "Colorful", prompt: "colorful perennials, hydrangeas and boxwood shrubs" },
          { id: "native", label: "Native", prompt: "native grasses and wildflowers" },
          { id: "low-care", label: "Low care", prompt: "low-maintenance shrubs and ornamental grasses" },
        ],
        default: "colorful",
      },
      {
        type: "choice",
        id: "edging",
        label: "Edging",
        choices: [
          { id: "stone", label: "Stone", prompt: "natural stone edging" },
          { id: "steel", label: "Steel", prompt: "black steel edging" },
          { id: "brick", label: "Brick", prompt: "brick edging" },
        ],
        default: "stone",
      },
    ],
  },
  {
    id: "pergola",
    label: "Pergola",
    icon: "Tent",
    kind: "area",
    scope: "outdoor",
    tall: true,
    defaultHeightM: 9 * FT,
    defaultSize: { widthM: 12 * FT, depthM: 12 * FT },
    defaultShape: "rect",
    hint: "Draw the footprint of the pergola on the ground.",
    noun: "pergola",
    options: [
      {
        type: "choice",
        id: "material",
        label: "Material",
        choices: [
          { id: "cedar", label: "Cedar", prompt: "natural cedar wood" },
          { id: "black-metal", label: "Black metal", prompt: "black powder-coated aluminum" },
          { id: "white", label: "White", prompt: "white painted wood" },
        ],
        default: "cedar",
      },
    ],
  },
  {
    id: "hot-tub",
    label: "Hot tub",
    icon: "Bath",
    kind: "area",
    scope: "outdoor",
    tall: false,
    defaultSize: { widthM: 7 * FT, depthM: 7 * FT },
    defaultShape: "rect",
    hint: "Draw around where the hot tub goes.",
    noun: "hot tub",
    options: [],
  },
  // Indoor
  {
    id: "walk-in-shower",
    label: "Walk-in shower",
    icon: "ShowerHead",
    kind: "area",
    scope: "indoor",
    spaces: ["bathroom", "basement", "laundry"],
    tall: true,
    defaultHeightM: 78 * IN,
    defaultSize: { widthM: 60 * IN, depthM: 36 * IN },
    defaultShape: "rect",
    preferInches: true,
    hint: "Drag the corners to fit. The rest of the room stays the same.",
    noun: "walk-in shower",
    options: [
      {
        type: "choice",
        id: "door",
        label: "Door",
        choices: [
          { id: "frameless", label: "Frameless glass", prompt: "a frameless glass panel" },
          { id: "framed", label: "Framed glass", prompt: "a black framed glass door" },
          { id: "none", label: "No door", prompt: "an open entry with no door" },
        ],
        default: "frameless",
      },
      {
        type: "choice",
        id: "tile",
        label: "Tile",
        choices: [
          { id: "large-stone", label: "Large stone", prompt: "large-format light stone tile" },
          { id: "subway", label: "Subway", prompt: "white subway tile" },
          { id: "zellige", label: "Zellige", prompt: "handmade zellige tile" },
        ],
        default: "large-stone",
      },
      { type: "toggle", id: "bench", label: "Bench", prompt: "a built-in tiled bench", default: true },
      { type: "toggle", id: "niche", label: "Niche", prompt: "a recessed wall niche", default: true },
      { type: "toggle", id: "rain-head", label: "Rain head", prompt: "a ceiling rain shower head", default: true },
    ],
  },
  {
    id: "bathtub",
    label: "Bathtub",
    icon: "Bath",
    kind: "area",
    scope: "indoor",
    spaces: ["bathroom", "basement", "laundry"],
    tall: false,
    defaultSize: { widthM: 60 * IN, depthM: 30 * IN },
    defaultShape: "rect",
    preferInches: true,
    hint: "Draw around where the tub goes.",
    noun: "bathtub",
    options: [
      {
        type: "choice",
        id: "style",
        label: "Style",
        choices: [
          { id: "freestanding", label: "Freestanding", prompt: "white freestanding soaking tub" },
          { id: "built-in", label: "Built-in", prompt: "tiled built-in alcove tub" },
        ],
        default: "freestanding",
      },
    ],
  },
  {
    id: "vanity",
    label: "Vanity",
    icon: "Droplets",
    kind: "area",
    scope: "indoor",
    spaces: ["bathroom", "basement", "laundry"],
    tall: true,
    defaultHeightM: 34 * IN,
    defaultSize: { widthM: 48 * IN, depthM: 21 * IN },
    defaultShape: "rect",
    preferInches: true,
    hint: "Draw the vanity footprint on the floor.",
    noun: "bathroom vanity",
    options: [
      {
        type: "choice",
        id: "style",
        label: "Style",
        choices: [
          { id: "floating-oak", label: "Floating oak", prompt: "floating warm oak vanity with a vessel sink" },
          { id: "white-shaker", label: "White shaker", prompt: "white shaker vanity with a quartz top" },
          { id: "navy", label: "Navy", prompt: "navy blue vanity with brass hardware" },
        ],
        default: "floating-oak",
      },
    ],
  },
  {
    id: "toilet",
    label: "Toilet",
    icon: "Toilet",
    kind: "area",
    scope: "indoor",
    spaces: ["bathroom", "basement", "laundry"],
    tall: true,
    defaultHeightM: 30 * IN,
    defaultSize: { widthM: 20 * IN, depthM: 28 * IN },
    defaultShape: "rect",
    preferInches: true,
    hint: "Draw where the toilet goes.",
    noun: "toilet",
    options: [],
  },
  {
    id: "kitchen-island",
    label: "Island",
    icon: "Square",
    kind: "area",
    scope: "indoor",
    spaces: ["kitchen", "basement", "dining-room"],
    tall: true,
    defaultHeightM: 36 * IN,
    defaultSize: { widthM: 7 * FT, depthM: 3.5 * FT },
    defaultShape: "rect",
    preferInches: true,
    hint: "Draw the island footprint on the floor.",
    noun: "kitchen island",
    options: [
      {
        type: "choice",
        id: "top",
        label: "Countertop",
        choices: [
          { id: "quartz", label: "White quartz", prompt: "white quartz countertop" },
          { id: "butcher", label: "Butcher block", prompt: "butcher block countertop" },
          { id: "marble", label: "Marble", prompt: "marble countertop" },
        ],
        default: "quartz",
      },
      { type: "toggle", id: "seating", label: "Seating", prompt: "bar stool seating on one side", default: true },
    ],
  },
  {
    id: "shelves",
    label: "Shelves",
    icon: "LibraryBig",
    kind: "area",
    scope: "indoor",
    tall: true,
    defaultHeightM: 84 * IN,
    defaultSize: { widthM: 6 * FT, depthM: 14 * IN },
    defaultShape: "rect",
    preferInches: true,
    hint: "Draw the shelves' footprint along the wall.",
    noun: "built-in shelving",
    options: [],
  },
  {
    id: "interior-wall",
    label: "Wall",
    icon: "BrickWall",
    kind: "line",
    scope: "indoor",
    tall: true,
    defaultHeightM: 8 * FT,
    hint: "Click along the floor where the new wall goes. Double-click to finish.",
    noun: "interior wall",
    options: [],
  },
  {
    id: "window",
    label: "Window",
    icon: "AppWindow",
    kind: "brush",
    scope: "both",
    tall: false,
    hint: "Paint where the window goes on the wall.",
    noun: "window",
    options: [
      {
        type: "choice",
        id: "style",
        label: "Style",
        choices: [
          { id: "double-hung", label: "Double hung", prompt: "white double-hung window" },
          { id: "picture", label: "Picture", prompt: "large black-framed picture window" },
        ],
        default: "double-hung",
      },
    ],
  },
  // Generic
  outdoorStructure("patio-cover", "Patio cover", "Tent", 14, 12, 9, [
    choice("attachment", "Placement", [["freestanding", "Freestanding", "freestanding"], ["attached", "Attached to house", "house-attached"]]),
    choice("roof", "Roof", [["shed", "Sloped", "with a single-slope solid roof"], ["gable", "Peaked", "with a gabled solid roof"]]),
    choice("material", "Material", [["wood", "Wood", "natural wood"], ["metal", "Metal", "powder-coated aluminum"]]),
  ]),
  outdoorStructure("gazebo", "Gazebo", "Tent", 12, 12, 10, [
    choice("style", "Style", [["modern", "Modern", "modern square"], ["traditional", "Traditional", "traditional octagonal"]]),
    choice("material", "Material", [["wood", "Wood", "natural wood"], ["metal", "Metal", "black metal"]]),
  ]),
  outdoorStructure("outdoor-kitchen", "Outdoor kitchen", "Flame", 10, 3, 4, [
    choice("layout", "Layout", [["straight", "Straight", "straight-run"], ["l-shape", "L-shaped", "L-shaped"]]),
    choice("material", "Finish", [["stone", "Stone", "stone-clad with a concrete countertop"], ["steel", "Stainless", "stainless steel"]]),
    { type: "toggle", id: "sink", label: "Sink", prompt: "a built-in sink", default: false },
    { type: "toggle", id: "bar", label: "Bar seating", prompt: "a breakfast bar and stools", default: false },
  ]),
  outdoorStructure("grill-area", "Grill area", "Flame", 6, 4, 4, [
    choice("style", "Grill", [["freestanding", "Freestanding", "freestanding grill with a prep cart"], ["built-in", "Built-in", "built-in grill with preparation counter"]]),
  ]),
  outdoorStructure("outdoor-seating", "Outdoor seating", "LibraryBig", 10, 8, 3, [
    choice("style", "Seating", [["sectional", "Sectional", "outdoor sectional sofa and coffee table"], ["chairs", "Chairs", "outdoor lounge chairs and side tables"]]),
  ]),
  outdoorStructure("outdoor-dining", "Outdoor dining", "Grid3x3", 10, 8, 3, [
    choice("seats", "Seats", [["four", "4 people", "table and chairs for four"], ["six", "6 people", "table and chairs for six"], ["eight", "8 people", "table and chairs for eight"]]),
  ]),
  outdoorStructure("play-structure", "Play structure", "Tent", 12, 10, 9, [
    choice("style", "Play equipment", [["tower", "Tower and slide", "wooden play tower with slide"], ["swings", "Swing set", "freestanding swing set"]]),
  ]),
  outdoorStructure("shed", "Shed", "Square", 10, 8, 9, [
    choice("style", "Style", [["modern", "Modern", "modern shed with single-slope roof"], ["classic", "Classic", "traditional garden shed with gable roof"]]),
  ]),
  {
    id: "lazy-river", label: "Lazy river", icon: "Waves", kind: "brush", scope: "outdoor", tall: false,
    hint: "Paint a loop where the water should flow. Leave the island unpainted.",
    noun: "lazy river water channel following the painted loop, with the unpainted island preserved", options: [],
  },
  {
    id: "outdoor-lighting", label: "Outdoor lighting", icon: "Sparkles", kind: "brush", scope: "outdoor", tall: false,
    hint: "Paint where the lights should go.", noun: "outdoor lighting",
    options: [choice("style", "Lights", [["string", "String lights", "warm string lights"], ["path", "Path lights", "low path lights"], ["wall", "Wall lights", "wall-mounted sconces"]])],
  },
  {
    id: "remove-area", label: "Remove something", icon: "Paintbrush", kind: "brush", scope: "both", tall: false,
    hint: "Paint over what to remove. Describe it below and uncheck it under Keeping if needed.",
    noun: "remove the painted object or surface and naturally reconstruct the background", options: [],
  },
  {
    id: "change-area",
    label: "Change this area",
    icon: "Paintbrush",
    kind: "brush",
    scope: "both",
    tall: false,
    hint: "Paint over what you want to change.",
    noun: "change",
    options: [],
  },
  {
    id: "other",
    label: "Other",
    icon: "Sparkles",
    kind: "area",
    scope: "both",
    tall: false,
    hint: "Draw around it, then tell us what it is.",
    noun: "addition",
    options: [],
  },
];

const byId = new Map(CATALOG.map((i) => [i.id, i]));

export function getItem(id: string): CatalogItem {
  return byId.get(id) ?? byId.get("other")!;
}

export function itemsForSpace(space: SpaceType): CatalogItem[] {
  const outdoor = isOutdoor(space);
  const list = CATALOG.filter((i) => {
    if (i.id === "other") return false;
    if (space === "other") return true;
    if (i.spaces && !i.spaces.includes(space)) return false;
    if (i.scope === "both") return true;
    return outdoor ? i.scope === "outdoor" : i.scope === "indoor";
  });
  return [...list, getItem("other")];
}

export function defaultOptions(id: string): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const opt of getItem(id).options) out[opt.id] = opt.default;
  return out;
}

/** Height chosen through a choice option such as fence "6ft". */
export function optionHeightM(id: string, options: Record<string, string | boolean>): number | undefined {
  const item = getItem(id);
  const opt = item.options.find((o): o is ChoiceOption => o.type === "choice" && o.id === "height");
  if (!opt) return item.defaultHeightM;
  const chosen = opt.choices.find((c) => c.id === options.height) ?? opt.choices.find((c) => c.id === opt.default);
  return chosen?.heightM ?? item.defaultHeightM;
}

/** Plain-words description of an item and its chosen options, used in AI prompts and the UI. */
export function describeItem(id: string, options: Record<string, string | boolean>, note = ""): string {
  const item = getItem(id);
  const parts: string[] = [];
  const extras: string[] = [];
  for (const opt of item.options) {
    if (opt.type === "choice") {
      const value = (options[opt.id] as string | undefined) ?? opt.default;
      const choice = opt.choices.find((c) => c.id === value);
      if (choice?.prompt) parts.push(choice.prompt);
    } else {
      const on = options[opt.id] ?? opt.default;
      if (on === true) extras.push(opt.prompt);
    }
  }
  let text = item.id === "other" || item.id === "change-area" ? "" : `${item.noun}`;
  if (parts.length) text = `${parts.join(", ")} ${item.noun}`;
  if (extras.length) text += ` with ${extras.join(", ")}`;
  if (note.trim()) text = text ? `${text} (${note.trim()})` : note.trim();
  return text.replace(/\s+/g, " ").trim();
}
