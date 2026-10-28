"use client";

import { cn } from "@architech/ui";
import type { CVersion } from "@/lib/types";

export function VersionsStrip({ versions, selectedId, onSelect, disabled }: { versions: CVersion[]; selectedId: string | null; onSelect: (id: string) => void; disabled?: boolean }) {
  const sorted = [...versions].sort((a, b) => a.number - b.number);
  return (
    <div className="scrollbar-none -mx-1 flex min-w-0 gap-3 overflow-x-auto px-1 py-1" role="listbox" aria-label="Versions">
      {sorted.map((v) => {
        const on = v.id === selectedId;
        return (
          <button
            key={v.id}
            type="button"
            role="option"
            aria-selected={on}
            disabled={disabled}
            onClick={() => onSelect(v.id)}
            className="flex w-[88px] shrink-0 flex-col items-center gap-1 disabled:opacity-60"
          >
            <span className={cn("block h-16 w-[88px] overflow-hidden rounded-xl bg-sand ring-offset-2 ring-offset-cream", on ? "ring-[3px] ring-forest" : "ring-1 ring-line")}>
              {v.thumbUrl ? <img src={v.thumbUrl} alt="" className="size-full object-cover" draggable={false} /> : null}
            </span>
            <span className={cn("w-full truncate text-center text-[13px] font-semibold", on ? "text-forest" : "text-muted")}>{v.number === 0 ? "Original" : v.label}</span>
          </button>
        );
      })}
    </div>
  );
}
