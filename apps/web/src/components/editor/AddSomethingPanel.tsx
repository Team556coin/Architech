"use client";

import { colorForNumber, describeItem, getItem, itemsForSpace, type Calibration, type ChoiceOption, type Dims, type Drawing, type SpaceType, type ToggleOption, type Units } from "@architech/core";
import { formatLength, measureDrawing, parseLength, resizeDrawing, type FitWarning, type GroundModel } from "@architech/measure";
import { Button, Chip, Segmented, Switch, cn } from "@architech/ui";
import { CircleAlert, Eraser, Paintbrush, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { canFinish, setOptions } from "@/lib/drawing-tools";
import { measuredSizeText, warningsFor } from "@/lib/measure-view";
import type { CProject } from "@/lib/types";
import { ItemIcon } from "../icons";
import { KeepingChips } from "./AssistantPanel";
import { LookField } from "./LookField";

export interface AddSomethingPanelProps {
  project: CProject;
  drawings: Drawing[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  activeItem: string | null;
  onPick: (itemId: string | null) => void;
  onUpdate: (d: Drawing, commit: boolean) => void;
  onDelete: (id: string) => void;
  draftId: string | null;
  onFinishDraft: () => void;
  onUndoDot: () => void;
  brush: { size: number; erase: boolean };
  setBrush: (b: { size: number; erase: boolean }) => void;
  model: GroundModel | null;
  calibration: Calibration | null;
  units: Units;
  onToggleKeep: (id: string) => void;
}

const SEGMENTED = new Set(["height", "width", "shape", "style"]);
const MAX_TILES = 9;

export function AddSomethingPanel(props: AddSomethingPanelProps) {
  const { project, drawings, selectedId, onSelect, activeItem, onPick, onUpdate, onDelete, draftId, onFinishDraft, onUndoDot, brush, setBrush, model, calibration, units, onToggleKeep } = props;
  const [showTiles, setShowTiles] = useState(drawings.length === 0);
  const [allTiles, setAllTiles] = useState(false);
  const [search, setSearch] = useState("");
  const items = itemsForSpace(project.spaceType as SpaceType);
  const query = search.trim().toLowerCase();
  const tiles = query ? items.filter((item) => `${item.label} ${item.noun}`.toLowerCase().includes(query)) : allTiles ? items : [...items.slice(0, MAX_TILES - 1), items.at(-1)!];
  const selected = drawings.find((d) => d.id === selectedId) ?? null;
  const others = drawings.filter((d) => d.id !== selectedId);
  const tilesOpen = showTiles || drawings.length === 0;

  useEffect(() => {
    if (selectedId) setShowTiles(false);
  }, [selectedId]);

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-line bg-white p-4 shadow-sm md:p-5">
      <h2 className="text-xl font-extrabold">{tilesOpen ? "Add something" : "Your additions"}</h2>

      {tilesOpen && (
        <div>
          <label className="mb-3 block">
            <span className="mb-1 block text-sm font-semibold">Find something to add or change</span>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Try kitchen, seating, gazebo..." className="h-11 w-full rounded-xl border border-line px-3 text-base" />
          </label>
          {tiles.length === 0 && (
            <div className="mb-3 rounded-xl bg-sand p-3">
              <p className="text-sm">Have something custom in mind? Place it, then describe it.</p>
              <Button variant="outline" className="mt-2" onClick={() => { onSelect(null); onPick("other"); }}>Add a custom idea</Button>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2.5">
            {tiles.map((it) => {
              const on = activeItem === it.id;
              return (
                <button
                  key={it.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    onSelect(null);
                    onPick(on ? null : it.id);
                  }}
                  className={cn(
                    "flex aspect-[1.1] flex-col items-center justify-center gap-1.5 rounded-2xl border bg-cream p-2 text-center text-[14px] font-bold leading-tight transition",
                    on ? "border-forest bg-forest-soft ring-2 ring-forest" : "border-line hover:border-forest/40",
                  )}
                >
                  <ItemIcon name={it.icon} className={cn("size-8", on ? "text-forest" : "text-ink/80")} />
                  {it.label}
                </button>
              );
            })}
          </div>
          {!query && items.length > MAX_TILES && (
            <button type="button" className="mt-2 text-sm font-bold text-forest" onClick={() => setAllTiles((v) => !v)}>
              {allTiles ? "Show fewer" : `Show all ${items.length}`}
            </button>
          )}
        </div>
      )}

      {selected && (
        <OptionCard
          key={selected.id}
          d={selected}
          model={model}
          units={units}
          warnings={selectedId === draftId ? [] : warningsFor(drawings, model, calibration).filter((w) => w.drawingIds.includes(selected.id))}
          onUpdate={onUpdate}
          onDelete={() => onDelete(selected.id)}
          drafting={selected.id === draftId}
          onFinishDraft={onFinishDraft}
          onUndoDot={onUndoDot}
          brush={brush}
          setBrush={setBrush}
        />
      )}

      {others.length > 0 && (
        <ul className="flex flex-col gap-2">
          {others.map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => onSelect(d.id)} className="flex w-full items-center gap-2.5 rounded-2xl border border-line p-3 text-left hover:border-forest/40">
                <NumberBadge n={d.number} />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{labelOf(d)}</span>
                  <span className="block truncate text-sm text-muted">{describeItem(d.itemType, d.options, d.note) || getItem(d.itemType).hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!tilesOpen && (
        <button
          type="button"
          onClick={() => {
            onSelect(null);
            setShowTiles(true);
          }}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line font-bold text-forest hover:border-forest/50"
        >
          <Plus className="size-5" /> Add something else
        </button>
      )}

      <KeepingChips project={project} onToggleKeep={onToggleKeep} />
    </div>
  );
}

const labelOf = (d: Drawing) => (d.itemType === "other" && d.note ? d.note.slice(0, 30) : getItem(d.itemType).label);

function NumberBadge({ n }: { n: number }) {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full text-sm font-extrabold text-white" style={{ background: colorForNumber(n).hex }}>
      {n}
    </span>
  );
}

function OptionCard({
  d,
  model,
  units,
  warnings,
  onUpdate,
  onDelete,
  drafting,
  onFinishDraft,
  onUndoDot,
  brush,
  setBrush,
}: {
  d: Drawing;
  model: GroundModel | null;
  units: Units;
  warnings: FitWarning[];
  onUpdate: (d: Drawing, commit: boolean) => void;
  onDelete: () => void;
  drafting: boolean;
  onFinishDraft: () => void;
  onUndoDot: () => void;
  brush: { size: number; erase: boolean };
  setBrush: (b: { size: number; erase: boolean }) => void;
}) {
  const item = getItem(d.itemType);
  const choices = item.options.filter((o): o is ChoiceOption => o.type === "choice");
  const toggles = item.options.filter((o): o is ToggleOption => o.type === "toggle");
  const m = measureDrawing(d, model);
  const set = (id: string, v: string | boolean) => onUpdate(setOptions(d, { ...d.options, [id]: v }, model), true);
  const resize = (dims: Dims) => {
    const next = resizeDrawing(d, model, dims);
    if (next) onUpdate(next, true);
  };
  const isRound = d.shape === "ellipse";
  const hasHeightChoice = choices.some((c) => c.id === "height");
  const sizeText = measuredSizeText(d, model, units);

  return (
    <div className="rounded-2xl border border-line bg-cream/60 p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <NumberBadge n={d.number} />
        <p className="flex-1 text-lg font-extrabold">{labelOf(d)}</p>
        <button type="button" aria-label={`Remove ${labelOf(d)}`} onClick={onDelete} className="grid size-9 place-items-center rounded-xl text-red-700 hover:bg-red-50">
          <Trash2 className="size-5" />
        </button>
      </div>

      {drafting && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-white p-2.5">
          <p className="flex-1 text-sm text-muted">{`${d.points.length} ${d.points.length === 1 ? "dot" : "dots"} placed`}</p>
          <Button size="sm" variant="outline" onClick={onUndoDot} disabled={d.points.length < 2}>
            Undo dot
          </Button>
          <Button size="sm" onClick={onFinishDraft} disabled={!canFinish(d)}>
            Done drawing
          </Button>
        </div>
      )}

      {d.kind === "brush" && (
        <div className="mb-3 flex flex-col gap-3">
          <Segmented
            label="Brush or eraser"
            value={brush.erase ? "erase" : "brush"}
            onChange={(v) => setBrush({ ...brush, erase: v === "erase" })}
            options={[
              { value: "brush", label: <span className="inline-flex items-center gap-1.5"><Paintbrush className="size-4" /> Brush</span> },
              { value: "erase", label: <span className="inline-flex items-center gap-1.5"><Eraser className="size-4" /> Eraser</span> },
            ]}
          />
          <label className="flex items-center gap-3 text-sm font-semibold">
            <span className="size-2 rounded-full bg-ink" aria-hidden />
            <input
              type="range"
              aria-label="Brush size"
              min={0.015}
              max={0.12}
              step={0.005}
              value={brush.size}
              onChange={(e) => setBrush({ ...brush, size: Number(e.target.value) })}
              className="flex-1 accent-forest"
            />
            <span className="size-5 rounded-full bg-ink" aria-hidden />
          </label>
          <Button variant="outline" size="sm" onClick={() => onUpdate({ ...d, strokes: [] }, true)} disabled={!d.strokes?.length}>
            Clear
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <LookField d={d} onChange={(look) => onUpdate({ ...d, look }, true)} />
        {choices.map((o) => {
          const value = (d.options[o.id] as string | undefined) ?? o.default;
          return (
            <div key={o.id}>
              <p className="mb-1.5 text-sm font-bold">{o.label}</p>
              {SEGMENTED.has(o.id) && o.choices.length <= 3 ? (
                <Segmented label={o.label} size="sm" value={value} onChange={(v) => set(o.id, v)} options={o.choices.map((c) => ({ value: c.id, label: c.label }))} />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {o.choices.map((c) => (
                    <Chip key={c.id} selected={value === c.id} onClick={() => set(o.id, c.id)}>
                      {c.label}
                    </Chip>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {sizeText && <p className="text-sm font-semibold">{sizeText}</p>}
        {toggles.length > 0 && (
          <div>
            <p className="mb-1.5 text-sm font-bold">Extras</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {toggles.map((o) => (
                <Switch key={o.id} label={o.label} checked={(d.options[o.id] ?? o.default) === true} onChange={(v) => set(o.id, v)} />
              ))}
            </div>
          </div>
        )}

        {d.kind !== "brush" && !drafting && (
          <div>
            <p className="mb-1.5 text-sm font-bold">Desired size (optional)</p>
            {model ? (
              <div className="grid grid-cols-2 gap-2">
                {isRound ? (
                  <SizeField label="Across" units={units} valueM={d.dims.diameterM} guessM={m?.diameterM} onCommit={(v) => resize({ diameterM: v, lengthM: undefined, widthM: undefined })} />
                ) : (
                  <>
                    <SizeField label="Length" units={units} valueM={d.dims.lengthM} guessM={m?.lengthM} onCommit={(v) => resize({ lengthM: v })} />
                    {d.kind === "area" && <SizeField label="Width" units={units} valueM={d.dims.widthM} guessM={m?.widthM} onCommit={(v) => resize({ widthM: v })} />}
                  </>
                )}
                {item.tall && !hasHeightChoice && <SizeField label="Height" units={units} valueM={d.dims.heightM} guessM={m?.heightM} onCommit={(v) => onUpdate({ ...d, dims: { ...d.dims, heightM: v } }, true)} />}
                {(d.itemType === "pool" || d.itemType === "fire-pit") && <SizeField label="Depth" units={units} valueM={d.dims.depthM} guessM={undefined} onCommit={(v) => onUpdate({ ...d, dims: { ...d.dims, depthM: v } }, true)} />}
              </div>
            ) : (
              <p className="text-sm text-muted">For a quick preview, describe the size below. To adjust the footprint to scale, use Check sizes first.</p>
            )}
            {warnings.map((w) => (
              <p key={w.message} role="status" className="mt-2 flex items-start gap-2 rounded-xl bg-amber-soft px-3 py-2 text-sm font-semibold text-amber-900">
                <CircleAlert className="mt-0.5 size-4 shrink-0" /> {w.message}
              </p>
            ))}
          </div>
        )}

        <label className="block">
          <span className="mb-1.5 block text-sm font-bold">{d.itemType === "other" || d.itemType === "change-area" ? "What should go here?" : "Anything else?"}</span>
          <input
            value={d.note}
            maxLength={500}
            onChange={(e) => onUpdate({ ...d, note: e.target.value }, false)}
            onBlur={() => onUpdate(d, true)}
            placeholder={d.itemType === "change-area" ? "e.g. replace with a 6 ft cedar privacy fence" : d.itemType === "other" ? "e.g. a hammock between the trees" : "e.g. cedar, stained dark"}
            className="h-11 w-full rounded-xl border border-line bg-white px-3 text-[16px] outline-none focus:border-forest/60"
          />
        </label>
      </div>
    </div>
  );
}

function SizeField({ label, units, valueM, guessM, onCommit }: { label: string; units: Units; valueM: number | undefined; guessM: number | undefined; onCommit: (m: number | undefined) => void }) {
  const shown = valueM ? formatLength(valueM, units) : "";
  const [text, setText] = useState(shown);
  const [bad, setBad] = useState(false);
  useEffect(() => setText(shown), [shown]);
  const commit = () => {
    if (!text.trim()) {
      setBad(false);
      if (valueM !== undefined) onCommit(undefined);
      return;
    }
    const v = parseLength(text, units);
    setBad(v === null);
    if (v !== null && v !== valueM) onCommit(v);
  };
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted">{label}</span>
      <input
        value={text}
        inputMode="decimal"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        placeholder={guessM ? formatLength(guessM, units, { estimated: true }) : units === "imperial" ? "e.g. 12 ft" : "e.g. 3.5 m"}
        aria-invalid={bad}
        className={cn("h-11 w-full rounded-xl border bg-white px-3 text-[16px] font-semibold outline-none focus:border-forest/60", bad ? "border-red-400" : "border-line")}
      />
    </label>
  );
}
