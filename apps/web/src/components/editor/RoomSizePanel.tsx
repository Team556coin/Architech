"use client";

import { isOutdoor, type Calibration, type Point, type Reference, type SpaceType, type Units } from "@architech/core";
import { formatLength, parseLength, type ReferenceProblem } from "@architech/measure";
import { Button, Segmented, cn } from "@architech/ui";
import { CircleAlert, CircleCheck, DoorOpen, Grid2x2, MoveHorizontal, MoveVertical } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { ScaleStatus } from "@/lib/measure-view";

export interface PendingMeasure {
  a: Point;
  b: Point;
  kind: Reference["kind"];
  /** Editing an existing measurement. */
  ref?: Reference;
}

export interface RoomSizePanelProps {
  calibration: Calibration;
  spaceType: SpaceType;
  status: ScaleStatus;
  onRoomSize: (size: NonNullable<Calibration["roomSize"]>) => void;
  onUnits: (u: Units) => void;
  pending: PendingMeasure | null;
  onSavePending: (lengthM: number, kind: Reference["kind"], label: string) => void;
  /** Flags a size that would make every measurement wrong. */
  checkPending: (lengthM: number, kind: Reference["kind"]) => ReferenceProblem | null;
  onRemovePending: () => void;
  onCancelPending: () => void;
  onFloorCorners: () => void;
  onClearFloor: () => void;
  floorMode: boolean;
  onSave: () => void;
  saving: boolean;
}

export function RoomSizePanel(props: RoomSizePanelProps) {
  const { calibration: cal, spaceType, status, onRoomSize, onUnits, pending, onSavePending, checkPending, onRemovePending, onCancelPending, onFloorCorners, onClearFloor, floorMode, onSave, saving } = props;
  const units = cal.units;
  const outdoor = isOutdoor(spaceType);
  const size = cal.roomSize ?? {};
  const canFloor = !!size.lengthM && !!size.widthM;

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-line bg-white p-4 shadow-sm md:p-5">
      <h2 className="text-xl font-extrabold">{outdoor ? "Yard size" : "Room size"}</h2>

      {pending && <MeasureCard key={pending.ref?.id ?? `${pending.a.x},${pending.a.y}`} pending={pending} units={units} outdoor={outdoor} onSave={onSavePending} check={checkPending} onRemove={onRemovePending} onCancel={onCancelPending} />}

      <div className="flex flex-col gap-3">
        <LengthField
          icon={<MoveHorizontal className="size-5" />}
          label="Length"
          help="side to side"
          units={units}
          valueM={size.lengthM}
          onCommit={(v) => onRoomSize({ ...size, lengthM: v })}
        />
        <LengthField icon={<MoveVertical className="size-5 rotate-45" />} label="Width" help="front to back" units={units} valueM={size.widthM} onCommit={(v) => onRoomSize({ ...size, widthM: v })} />
        {!outdoor && <LengthField icon={<MoveVertical className="size-5" />} label="Ceiling height" units={units} valueM={size.ceilingM} onCommit={(v) => onRoomSize({ ...size, ceilingM: v })} />}
      </div>

      <Segmented
        label="Units"
        value={units}
        onChange={onUnits}
        options={[
          { value: "imperial", label: "ft / in" },
          { value: "metric", label: "meters" },
        ]}
      />

      {status === "user" ? (
        <p className="flex items-center gap-2 rounded-xl bg-forest-soft px-3 py-2.5 font-semibold text-forest">
          <CircleCheck className="size-5 shrink-0" /> Scale based on your measurements; check derived sizes on site
        </p>
      ) : status === "suspect" ? (
        <p className="flex items-center gap-2 rounded-xl bg-amber-soft px-3 py-2.5 font-semibold text-amber-900">
          <CircleAlert className="size-5 shrink-0" /> A measurement doesn't look right, so sizes may be off. Tap it on the photo to fix it.
        </p>
      ) : status === "estimated" ? (
        <p className="flex items-center gap-2 rounded-xl bg-amber-soft px-3 py-2.5 font-semibold text-amber-900">
          <CircleAlert className="size-5 shrink-0" /> Sizes are estimated. Measure a visible edge to improve the scale.
        </p>
      ) : (
        <p className="flex items-center gap-2 rounded-xl bg-amber-soft px-3 py-2.5 font-semibold text-amber-900">
          <CircleAlert className="size-5 shrink-0" /> No scale yet. Measure one thing you know.
        </p>
      )}

      <div className="flex items-start gap-3 rounded-2xl border border-line bg-cream p-3">
        <DoorOpen className="mt-0.5 size-6 shrink-0 text-forest" aria-hidden />
        <p className="text-sm">
          <b>Tip:</b> {outdoor ? "a garage door is usually 7 ft tall, a house door 80 in." : "most doors are 80 in tall."} Tap <b>Measure something</b>, drag along it, and type its size.
        </p>
      </div>

      <div className="rounded-2xl border border-line p-3">
        <p className="flex items-center gap-2 font-bold">
          <Grid2x2 className="size-5 text-forest" /> Improve perspective: mark the {outdoor ? "yard" : "floor"} corners
        </p>
        <p className="mt-1 text-sm text-muted">Type the length and width above, then tap the 4 corners on the photo.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant={floorMode ? "primary" : "outline"} disabled={!canFloor} onClick={onFloorCorners}>
            {floorMode ? "Tapping corners..." : cal.floorRect ? "Mark again" : "Mark corners"}
          </Button>
          {cal.floorRect && (
            <Button size="sm" variant="ghost" onClick={onClearFloor}>
              Remove
            </Button>
          )}
        </div>
      </div>

      <Button size="lg" block onClick={onSave} disabled={saving}>
        {saving ? "Saving..." : outdoor ? "Save yard size" : "Save room size"}
      </Button>
    </div>
  );
}

function LengthField({ icon, label, help, units, valueM, onCommit }: { icon: ReactNode; label: string; help?: string; units: Units; valueM: number | undefined; onCommit: (m: number | undefined) => void }) {
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
    if (v !== null) onCommit(v);
  };
  return (
    <label className="flex items-center gap-3 rounded-2xl border border-line bg-cream px-3 py-2">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-forest">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">
          {label} {help && <span className="font-normal text-muted">({help})</span>}
        </span>
        <input
          value={text}
          inputMode="decimal"
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          placeholder={units === "imperial" ? "e.g. 9 ft 2 in" : "e.g. 2.8 m"}
          aria-label={label}
          aria-invalid={bad}
          className={cn("w-full bg-transparent text-lg font-extrabold outline-none placeholder:font-semibold placeholder:text-muted", bad && "text-red-700")}
        />
      </span>
    </label>
  );
}

function MeasureCard({
  pending,
  units,
  outdoor,
  onSave,
  check,
  onRemove,
  onCancel,
}: {
  pending: PendingMeasure;
  units: Units;
  outdoor: boolean;
  onSave: (lengthM: number, kind: Reference["kind"], label: string) => void;
  check: (lengthM: number, kind: Reference["kind"]) => ReferenceProblem | null;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(pending.ref ? formatLength(pending.ref.lengthM, units, { preferInches: pending.ref.lengthM < 3 }) : "");
  const [kind, setKind] = useState<Reference["kind"]>(pending.ref?.kind ?? pending.kind);
  const [label, setLabel] = useState(pending.ref?.label ?? "");
  const [bad, setBad] = useState(false);
  const [problem, setProblem] = useState<ReferenceProblem | null>(null);
  const floor = outdoor ? "ground" : "floor";
  const save = () => {
    const v = parseLength(text, units);
    if (v === null) return setBad(true);
    if (!problem) {
      const p = check(v, kind);
      if (p) return setProblem(p);
    }
    onSave(v, kind, label);
  };
  return (
    <form
      className="rounded-2xl border-2 border-forest bg-forest-soft/50 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <p className="text-lg font-extrabold">{pending.ref?.source === "estimated" ? "What's the real size?" : "How long is this?"}</p>
      <input
        autoFocus
        value={text}
        inputMode="decimal"
        onChange={(e) => {
          setText(e.target.value);
          setBad(false);
          setProblem(null);
        }}
        placeholder={units === "imperial" ? "e.g. 80 in or 12 ft" : "e.g. 2.03 m"}
        aria-label="Real length"
        aria-invalid={bad}
        className={cn("mt-2 h-12 w-full rounded-xl border bg-white px-3 text-lg font-bold outline-none", bad ? "border-red-400" : "border-line")}
      />
      {bad && <p className="mt-1 text-sm font-semibold text-red-700">Type a size like {units === "imperial" ? "80 in or 6 ft 8 in" : "2.03 m"}.</p>}
      <div className="mt-3">
        <Segmented
          label="Standing up or lying flat"
          size="sm"
          value={kind}
          onChange={(k) => {
            setKind(k);
            setProblem(null);
          }}
          options={[
            { value: "vertical", label: "Standing up" },
            { value: "ground", label: "On the floor" },
          ]}
        />
      </div>
      <input
        value={label}
        maxLength={80}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="What is it? e.g. door, back of shed"
        aria-label="What is it"
        className="mt-3 h-11 w-full rounded-xl border border-line bg-white px-3 text-[16px] outline-none"
      />
      {problem && (
        <p role="alert" className="mt-3 flex gap-2 rounded-xl bg-amber-soft px-3 py-2 text-sm font-semibold text-amber-900">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {problem === "not_on_floor"
            ? `That doesn't seem to touch the ${floor}, so sizes would come out wrong. Measure something that stands on the ${floor}, like a door.`
            : "That size doesn't fit this photo. Check the number, or measure something else."}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="submit">{problem ? "Use it anyway" : "Use this size"}</Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        {pending.ref && (
          <Button variant="danger" onClick={onRemove}>
            Remove
          </Button>
        )}
      </div>
    </form>
  );
}
