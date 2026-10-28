"use client";

import { colorForNumber, getItem } from "@architech/core";
import { Button, Chip, cn } from "@architech/ui";
import { Check, Paintbrush, Pencil, Ruler, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import type { CProject, CVersion, Suggestion } from "@/lib/types";
import { ChatInput } from "./ChatInput";
import { GeneratingSteps } from "./Generating";
import { PlanningDetails } from "./PlanningDetails";

export interface AssistantPanelProps {
  project: CProject;
  selected: CVersion | null;
  onToggleKeep: (id: string) => void;
  chips: Suggestion[];
  onChip: (s: Suggestion) => void;
  message: string;
  setMessage: (v: string) => void;
  onSend: () => void;
  busy: boolean;
  stage: string | null;
  onAddSomething: () => void;
  onPaint: () => void;
  onRemove: () => void;
  onPlan: () => void;
  onRoomSize: () => void;
  scaleSet: boolean;
}

export function KeepingChips({ project, onToggleKeep, disabled }: { project: CProject; onToggleKeep: (id: string) => void; disabled?: boolean }) {
  if (!project.keep.length) return null;
  return (
    <section aria-label="Keeping">
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">Keeping</h3>
      <div className="flex flex-wrap gap-2">
        {project.keep.map((k) => (
          <Chip key={k.id} checkmark selected={k.keep} disabled={disabled} onClick={() => onToggleKeep(k.id)} title={k.keep ? `Tap if ${k.label} can change` : `Tap to keep ${k.label}`}>
            <span className={cn(!k.keep && "text-muted line-through")}>{k.label}</span>
          </Chip>
        ))}
      </div>
    </section>
  );
}

export function AssistantPanel(props: AssistantPanelProps) {
  const { project, selected, onToggleKeep, chips, onChip, message, setMessage, onSend, busy, stage, onAddSomething, onPaint, onRemove, onRoomSize, scaleSet } = props;
  const list = useRef<HTMLDivElement>(null);
  const messages = project.messages.slice(-14);
  const drawn = selected?.request?.drawings ?? [];
  const keptAll = selected && selected.number > 0 && selected.verified && project.keep.some((k) => k.keep);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);

  return (
    <div className="flex h-full flex-col gap-4 rounded-3xl border border-line bg-white p-4 shadow-sm md:p-5">
      <h2 className="text-xl font-extrabold">What do you want to change?</h2>
      <p className="-mt-2 text-sm text-muted">Describe your idea or mark a spot. Measurements are optional.</p>
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-forest">Choose what stays</summary>
        <div className="mt-3"><KeepingChips project={project} onToggleKeep={onToggleKeep} disabled={busy} /></div>
      </details>
      {keptAll && (
        <p className="-mt-2 flex items-center gap-1.5 text-sm font-semibold text-forest">
          <Check className="size-4" /> Preserved features visually checked
        </p>
      )}
      {drawn.length > 0 && (
        <section aria-label="Built from your drawing">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">Built from your drawing</h3>
          <div className="flex flex-wrap gap-2">
            {drawn.map((d) => (
              <span key={d.id} className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-line px-2.5 text-sm font-semibold">
                <span className="grid size-5 place-items-center rounded-full text-xs font-extrabold text-white" style={{ background: colorForNumber(d.number).hex }}>
                  {d.number}
                </span>
                {d.itemType === "other" && d.note ? d.note.slice(0, 24) : getItem(d.itemType).label}
                <Check className="size-4 text-forest" />
              </span>
            ))}
          </div>
        </section>
      )}

      <div ref={list} className="-mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 md:max-h-[46vh]">
        {messages.length === 0 && !busy && (
          <div>
            <p className="text-muted">{project.analysis.summary || "Tap an idea or tell us in your own words."}</p>
          </div>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <p key={m.id} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-forest px-4 py-2.5 text-white">
              {m.content}
            </p>
          ) : (
            <div key={m.id} className="flex max-w-[92%] gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-coral-soft text-coral">
                <Sparkles className="size-4" aria-hidden />
              </span>
              <p className="rounded-2xl rounded-tl-md bg-sand px-4 py-2.5">{m.content}</p>
            </div>
          ),
        )}
        {busy && stage && <GeneratingSteps stage={stage} />}
      </div>

      {!busy && chips.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Ideas">
          {chips.slice(0, 6).map((c, i) => (
            <Chip key={c.label} tone={i === 0 && messages.length === 0 ? "coral" : "default"} onClick={() => onChip(c)}>
              {c.label}
            </Chip>
          ))}
        </div>
      )}

      {selected && selected.number > 0 && !busy && (
        <div className="flex flex-wrap gap-2" aria-label="Refine this preview">
          {[
            ["Wrong spot", "Keep the current design, but move "],
            ["Wrong size", "Keep everything else the same, but resize "],
            ["Different style", "Keep the placement and size, but change the style of "],
            ["Something changed", "Restore this feature from the original design: "],
          ].map(([label, prompt]) => <Chip key={label} onClick={() => setMessage(prompt!)}>{label}</Chip>)}
        </div>
      )}
      <ChatInput value={message} onChange={setMessage} onSend={onSend} disabled={busy} placeholder={messages.length ? "Tell me what to change next..." : "e.g. add a grill area and seating for six"} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onAddSomething} disabled={busy}>
          <Pencil className="size-4" /> Add something
        </Button>
        <Button variant="outline" onClick={onPaint} disabled={busy}>
          <Paintbrush className="size-4" /> Change a spot
        </Button>
        <Button variant="outline" onClick={onRemove} disabled={busy}>Remove something</Button>
        <Button variant="outline" onClick={onRoomSize} disabled={busy}>
          <Ruler className="size-4" /> {scaleSet ? "Review sizes" : "Check sizes"}
        </Button>
      </div>
      <Button variant="outline" onClick={props.onPlan} disabled={busy}>Open project planner</Button>
      <PlanningDetails project={project} selected={selected} onMeasure={onRoomSize} onPlace={onAddSomething} disabled={busy} />
    </div>
  );
}
