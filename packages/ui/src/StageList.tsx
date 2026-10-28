import { cn } from "./cn";

export interface StageListProps {
  stages: { id: string; label: string }[];
  current: string;
  className?: string;
}

export function StageList({ stages, current, className }: StageListProps) {
  const idx = Math.max(0, stages.findIndex((s) => s.id === current));
  return (
    <ul className={cn("divide-y divide-line/70", className)}>
      {stages.map((s, i) => {
        const state = i < idx ? "done" : i === idx ? "active" : "todo";
        return (
          <li key={s.id} data-state={state} className={cn("flex items-center gap-3 py-2.5 font-semibold", state === "todo" ? "text-muted" : "text-ink")}>
            {state === "done" && (
              <span className="grid size-6 place-items-center rounded-full bg-forest text-white">
                <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            )}
            {state === "active" && <span className="size-6 animate-spin rounded-full border-[3px] border-coral border-t-transparent" />}
            {state === "todo" && <span className="size-6 rounded-full border-2 border-line" />}
            {s.label}
          </li>
        );
      })}
    </ul>
  );
}
