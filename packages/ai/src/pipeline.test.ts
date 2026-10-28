import { designAlternativeSchema, newDesignItem, type Drawing } from "@architech/core";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { runEdit, type EditDeps, type EditInput, RefusedError } from "./pipeline";

const img = (rgb: [number, number, number], w = 120, h = 80) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }).jpeg().toBuffer();

const pool: Drawing = {
  id: "p",
  number: 1,
  itemType: "pool",
  kind: "area",
  shape: "rect",
  points: [
    { x: 0.4, y: 0.4 },
    { x: 0.6, y: 0.4 },
    { x: 0.6, y: 0.6 },
    { x: 0.4, y: 0.6 },
  ],
  zoneHeight: 0,
  options: {},
  note: "",
  dims: {},
};

async function input(drawings: Drawing[] = []): Promise<EditInput> {
  return {
    base: await img([100, 100, 100]),
    request: { message: "add a pool", drawings, keep: [{ id: "shed", label: "Shed", keep: true }], fromOriginal: false },
    spaceType: "backyard",
    calibration: null,
    history: [],
  };
}

function deps(overrides: Partial<EditDeps> = {}): EditDeps {
  return {
    plan: vi.fn().mockResolvedValue({ allowed: true, refusal: null, reply: "Adding your pool!", editPrompt: "Add a pool.", followUps: ["Add lights"] }),
    edit: vi.fn().mockImplementation(async () => img([0, 0, 255], 150, 100)),
    verify: vi.fn().mockResolvedValue({ pass: true, problems: [] }),
    ...overrides,
  };
}

describe("runEdit", () => {
  it("uses the saved scene and selected reference photo for a planned preview", async () => {
    const d = deps();
    const photo = await img([80, 130, 90], 160, 100);
    const reference = { id: "view", label: "Back corner", dataUrl: `data:image/jpeg;base64,${photo.toString("base64")}` };
    const base = await input();
    const design = designAlternativeSchema.parse({ id: "plan", name: "Outdoor dining", items: [{ ...newDesignItem("patio-cover", "roof"), width: 4, material: "Cedar" }] });
    const out = await runEdit(d, { ...base, request: { ...base.request, design, basePhoto: reference, contextPhotos: [reference] } });
    expect(d.plan).toHaveBeenCalledWith(expect.objectContaining({ contextPhotos: [expect.any(Buffer)], drawingNotes: expect.arrayContaining([expect.stringContaining("Cedar")]) }));
    const call = (d.edit as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.prompt).toContain("Outdoor dining");
    expect(call.prompt).toContain("width=4");
    expect((await sharp(out.image).metadata()).width).toBe(160);
  });

  it("checks standing structures requested through chat without requiring drawings", async () => {
    const d = deps({ plan: vi.fn().mockResolvedValue({ allowed: true, refusal: null, reply: "Adding a gazebo.", editPrompt: "Add a gazebo.", followUps: [], standing: true }) });
    await runEdit(d, { ...await input(), request: { message: "Add a gazebo", drawings: [], keep: [], fromOriginal: false } });
    expect(d.verify).toHaveBeenCalledWith(expect.objectContaining({ standing: true, guide: null }));
  });

  it("protects foreground objects for standing area additions, not only fences", async () => {
    const gazebo: Drawing = { ...pool, itemType: "gazebo", zoneHeight: 0.25 };
    const occlude = vi.fn().mockResolvedValue([{ label: "chair", points: [
      { x: 0.45, y: 0.4 }, { x: 0.55, y: 0.4 }, { x: 0.55, y: 0.6 }, { x: 0.45, y: 0.6 },
    ] }]);
    const d = deps({ occlude });
    const out = await runEdit(d, await input([gazebo]));
    expect(occlude).toHaveBeenCalledTimes(1);
    expect(occlude).toHaveBeenCalledWith(expect.objectContaining({ message: "add a pool", drawingNotes: expect.arrayContaining([expect.stringContaining("gazebo")]) }));
    const { data, info } = await sharp(out.image).raw().toBuffer({ resolveWithObject: true });
    const offset = (40 * info.width + 60) * info.channels;
    expect(Math.abs(data[offset]! - 100)).toBeLessThan(12);
    expect(Math.abs(data[offset + 2]! - 100)).toBeLessThan(12);
  });

  it("plans, paints, checks and reports each stage", async () => {
    const d = deps();
    const stages: string[] = [];
    const out = await runEdit(d, await input(), (s) => stages.push(s));
    expect(stages).toEqual(["understanding", "planning", "painting", "checking", "done"]);
    expect(out.verified).toBe(true);
    expect(out.reply).toBe("Adding your pool!");
    expect(out.followUps).toEqual(["Add lights"]);
    const meta = await sharp(out.image).metadata();
    expect(meta.width).toBe(120);
    expect(meta.height).toBe(80);
  });

  it("sends the guide image and pixel-locks outside the drawing", async () => {
    const d = deps();
    const out = await runEdit(d, await input([pool]));
    const editCall = (d.edit as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(editCall.images).toHaveLength(2);
    const { data, info } = await sharp(out.image).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => Array.from(data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3));
    const corner = at(3, 3);
    expect(Math.abs(corner[2]! - 100)).toBeLessThan(8); // original gray, not the AI's blue
    expect(at(60, 40)[2]!).toBeGreaterThan(200); // AI blue inside the pool zone
  });

  it("sends a board sample after the placement guide", async () => {
    const fence: Drawing = {
      id: "f",
      number: 1,
      itemType: "fence",
      kind: "line",
      shape: "polyline",
      points: [
        { x: 0.1, y: 0.7 },
        { x: 0.9, y: 0.7 },
      ],
      zoneHeight: 0.2,
      options: { height: "6ft" },
      look: { source: "preset", presetId: "dog-ear" },
      note: "",
      dims: {},
    };
    const d = deps();
    const base = await input([fence]);
    await runEdit(d, { ...base, samples: [{ drawingId: "f", image: await img([180, 140, 90], 40, 30) }] });
    const editCall = (d.edit as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(editCall.images).toHaveLength(3);
    expect(editCall.prompt).toContain("Image 3");
    expect(editCall.prompt.toLowerCase()).toContain("dog-ear");
  });

  it("retries with the checker's feedback, for free, then succeeds", async () => {
    const verify = vi
      .fn()
      .mockResolvedValueOnce({ pass: false, problems: ["The shed disappeared."] })
      .mockResolvedValueOnce({ pass: true, problems: [] });
    const d = deps({ verify });
    const out = await runEdit(d, await input());
    expect(d.edit).toHaveBeenCalledTimes(2);
    expect((d.edit as ReturnType<typeof vi.fn>).mock.calls[1]![0].prompt).toContain("The shed disappeared.");
    expect(out.attempts).toBe(2);
    expect(out.verified).toBe(true);
  });

  it("stops after the retry limit and returns the last result marked unverified", async () => {
    const d = deps({ verify: vi.fn().mockResolvedValue({ pass: false, problems: ["Window moved."] }) });
    const out = await runEdit(d, await input());
    expect(d.edit).toHaveBeenCalledTimes(3);
    expect(out.verified).toBe(false);
    expect(out.problems).toEqual(["Window moved."]);
  });

  it("keeps a car in front of a fence and retries without deleting it", async () => {
    const fence: Drawing = {
      id: "f",
      number: 1,
      itemType: "fence",
      kind: "line",
      shape: "polyline",
      points: [
        { x: 0.1, y: 0.75 },
        { x: 0.9, y: 0.75 },
      ],
      zoneHeight: 0.3,
      options: { height: "6ft" },
      note: "",
      dims: {},
    };
    const occlude = vi.fn().mockResolvedValue([
      {
        label: "black car",
        points: [
          { x: 0.55, y: 0.5 },
          { x: 0.85, y: 0.5 },
          { x: 0.85, y: 0.8 },
          { x: 0.55, y: 0.8 },
        ],
      },
    ]);
    const verify = vi
      .fn()
      .mockResolvedValueOnce({ pass: false, problems: ["Remove the black car completely instead of having the fence sit on top of its trunk."] })
      .mockResolvedValueOnce({ pass: true, problems: [] });
    const d = deps({ occlude, verify });
    const out = await runEdit(d, await input([fence]));
    expect(occlude).toHaveBeenCalledTimes(1);
    expect((d.verify as ReturnType<typeof vi.fn>).mock.calls[0]![0].standing).toBe(true);
    const retry = (d.edit as ReturnType<typeof vi.fn>).mock.calls[1]![0].prompt as string;
    expect(retry.toLowerCase()).toContain("keep the black car");
    expect(retry.toLowerCase()).not.toContain("remove the black car");
    const { data, info } = await sharp(out.image).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => Array.from(data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3));
    const car = at(84, 52);
    expect(Math.abs(car[0]! - 100)).toBeLessThan(12);
    expect(at(36, 48)[2]!).toBeGreaterThan(200);
    expect(out.verified).toBe(true);
  });

  it("still paints a fence when the foreground check fails", async () => {
    const fence: Drawing = {
      id: "f",
      number: 1,
      itemType: "fence",
      kind: "line",
      shape: "polyline",
      points: [
        { x: 0.1, y: 0.75 },
        { x: 0.9, y: 0.75 },
      ],
      zoneHeight: 0.3,
      options: {},
      note: "",
      dims: {},
    };
    const d = deps({ occlude: vi.fn().mockRejectedValue(new Error("down")) });
    const out = await runEdit(d, await input([fence]));
    expect(out.verified).toBe(true);
  });

  it("refuses requests the planner rejects without painting", async () => {
    const occlude = vi.fn();
    const d = deps({
      occlude,
      plan: vi.fn().mockResolvedValue({ allowed: false, refusal: "I can only help with home projects.", reply: "", editPrompt: "", followUps: [] }),
    });
    const fence: Drawing = {
      id: "f",
      number: 1,
      itemType: "fence",
      kind: "line",
      shape: "polyline",
      points: [
        { x: 0.1, y: 0.75 },
        { x: 0.9, y: 0.75 },
      ],
      zoneHeight: 0.3,
      options: {},
      note: "",
      dims: {},
    };
    await expect(runEdit(d, await input([fence]))).rejects.toBeInstanceOf(RefusedError);
    expect(d.edit).not.toHaveBeenCalled();
    expect(occlude).not.toHaveBeenCalled();
  });

  it("keeps the result if the checker itself fails", async () => {
    const d = deps({ verify: vi.fn().mockRejectedValue(new Error("checker down")) });
    const out = await runEdit(d, await input());
    expect(out.verified).toBe(false);
    expect(d.edit).toHaveBeenCalledTimes(1);
  });
});
