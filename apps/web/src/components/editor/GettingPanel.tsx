"use client";

import { colorForNumber, isOutdoor, type Calibration, type Drawing, type SpaceType, type Units } from "@architech/core";
import type { GroundModel } from "@architech/measure";
import { Button, Chip } from "@architech/ui";
import { CircleAlert, CircleCheck, Ruler } from "lucide-react";
import { basisText, gettingFor, roomSizeText, warningsFor, type ScaleStatus } from "@/lib/measure-view";
import type { CProject, Suggestion } from "@/lib/types";
import { ItemIcon } from "../icons";
import { ChatInput } from "./ChatInput";

export interface GettingPanelProps {
  project: CProject;
  drawings: Drawing[];
  model: GroundModel | null;
  calibration: Calibration | null;
  units: Units;
  chips: Suggestion[];
  onChip: (s: Suggestion) => void;
  message: string;
  setMessage: (v: string) => void;
  onSend: () => void;
  busy: boolean;
  onRoomSize: () => void;
  scaleStatus: ScaleStatus;
}

export function GettingPanel(props: GettingPanelProps) {
  const { project, drawings, model, calibration, units, chips, onChip, message, setMessage, onSend, busy, onRoomSize, scaleStatus } = props;
  const items = gettingFor(drawings, model, units);
  const warnings = warningsFor(drawings, model, calibration);
  const basis = basisText(calibration, units);
  const room = roomSizeText(calibration, units);
  const kept = project.keep.filter((k) => k.keep).map((k) => k.label);
  const outdoor = isOutdoor(project.spaceType as SpaceType);
  const single = items.length === 1;

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-line bg-white p-4 shadow-sm md:p-5">
      <h2 className="flex items-center gap-2 text-xl font-extrabold">
        {single && <ItemIcon name={items[0]!.icon} className="size-6 text-forest" />}
        What you&apos;re getting
      </h2>

      {scaleStatus === "suspect" ? (
        <div className="rounded-2xl bg-amber-soft p-4">
          <p className="font-semibold">These sizes may be off.</p>
          <p className="text-sm text-muted">One of your measurements doesn&apos;t touch the {outdoor ? "ground" : "floor"} or doesn&apos;t fit the photo. Measure a door instead.</p>
          <Button size="sm" className="mt-3" onClick={onRoomSize}>
            <Ruler className="size-4" /> Fix the size
          </Button>
        </div>
      ) : (
        !model && (
          <div className="rounded-2xl bg-amber-soft p-4">
            <p className="font-semibold">Sizes need one real measurement.</p>
            <p className="text-sm text-muted">Measure a visible edge to improve the photo scale. Other sizes remain estimates.</p>
            <Button size="sm" className="mt-3" onClick={onRoomSize}>
              <Ruler className="size-4" /> Set the size
            </Button>
          </div>
        )
      )}

      {model && items.length === 0 && <p className="text-muted">Draw something with Add something to see its sizes here.</p>}

      {items.map((it) => (
        <div key={it.id} className={single ? "" : "rounded-2xl border border-line p-3"}>
          {!single && (
            <p className="mb-1.5 flex items-center gap-2 font-bold">
              <span className="grid size-6 place-items-center rounded-full text-xs font-extrabold text-white" style={{ background: colorForNumber(it.number).hex }}>
                {it.number}
              </span>
              {it.label}
            </p>
          )}
          <dl className="divide-y divide-line/70">
            {it.rows.map((r) => (
              <div key={r.label} className="flex justify-between gap-4 py-2">
                <dt className="text-muted">{r.label}</dt>
                <dd className="text-right font-bold">{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}

      {room && (
        <div className="flex justify-between gap-4 border-t border-line/70 pt-2">
          <span className="text-muted">{outdoor ? "Yard size" : "Room"}</span>
          <span className="font-bold">{room}</span>
        </div>
      )}

      {kept.length > 0 && (
        <p className="flex items-start gap-2 font-semibold text-forest">
          <CircleCheck className="mt-0.5 size-5 shrink-0" /> Kept: {kept.join(", ")}
        </p>
      )}

      {warnings.map((w) => (
        <p key={w.message} className="flex items-start gap-2 rounded-xl bg-amber-soft px-3 py-2 text-sm font-semibold text-amber-900">
          <CircleAlert className="mt-0.5 size-4 shrink-0" /> {w.message}
        </p>
      ))}

      {basis && (
        <p className="flex items-start gap-2 text-sm text-muted">
          <Ruler className="mt-0.5 size-4 shrink-0" /> {basis}
        </p>
      )}

      {!busy && chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.slice(0, 4).map((c) => (
            <Chip key={c.label} onClick={() => onChip(c)}>
              {c.label}
            </Chip>
          ))}
        </div>
      )}
      <ChatInput value={message} onChange={setMessage} onSend={onSend} disabled={busy} />
    </div>
  );
}
