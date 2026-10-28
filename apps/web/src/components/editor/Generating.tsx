"use client";

import { StageList } from "@architech/ui";
import { WandSparkles } from "lucide-react";
import { useEffect, useState } from "react";

const STAGES = [
  { id: "understanding", label: "Understanding your space" },
  { id: "planning", label: "Planning the design" },
  { id: "painting", label: "Painting it in" },
  { id: "checking", label: "Checking nothing else changed" },
];

export const stageIndex = (stage: string) => {
  if (stage === "retrying") return 2;
  if (stage === "done") return STAGES.length;
  const i = STAGES.findIndex((s) => s.id === stage);
  return i < 0 ? 0 : i;
};

/** Covers the photo while an edit is being made. */
export function GeneratingOverlay({ stage, spaceName, startedAt }: { stage: string; spaceName: string; startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const i = stageIndex(stage);
  const byStage = (i / STAGES.length) * 100;
  const byTime = Math.min(92, ((now - startedAt) / 40_000) * 100);
  const pct = Math.round(Math.max(6, Math.min(96, Math.max(byStage, byTime))));
  return (
    <div className="absolute inset-0 z-20 grid place-items-center overflow-hidden rounded-2xl bg-ink/35 backdrop-blur-[3px]" role="status" aria-live="polite">
      <div className="shimmer pointer-events-none absolute inset-0" />
      <div className="relative mx-4 w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
        <WandSparkles className="mx-auto size-10 text-coral" aria-hidden />
        <p className="mt-3 text-lg font-extrabold">Designing your new {spaceName}...</p>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-sand" aria-label={`${pct}% done`}>
          <div className="h-full rounded-full bg-coral transition-[width] duration-700" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-sm text-muted">{stage === "retrying" ? "Making it more accurate..." : "Usually about 30 seconds"}</p>
      </div>
    </div>
  );
}

export function GeneratingSteps({ stage }: { stage: string }) {
  const i = stageIndex(stage);
  return <StageList stages={STAGES} current={STAGES[Math.min(i, STAGES.length - 1)]!.id} className="rounded-2xl border border-line bg-white px-4" />;
}
