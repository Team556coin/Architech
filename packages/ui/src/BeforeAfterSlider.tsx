import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { cn } from "./cn";

export interface BeforeAfterSliderProps {
  before: string;
  after: string;
  /** width / height of the photo */
  aspect: number;
  initial?: number;
  onChange?: (percent: number) => void;
  beforeLabel?: string;
  afterLabel?: string;
  /** Drawn on top of the "after" side (e.g. measurements). */
  overlay?: ReactNode;
  className?: string;
}

const clamp = (v: number) => Math.min(100, Math.max(0, v));

export function BeforeAfterSlider({ before, after, aspect, initial = 50, onChange, beforeLabel = "Before", afterLabel = "After", overlay, className }: BeforeAfterSliderProps) {
  const [pos, setPos] = useState(initial);
  const area = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const set = useCallback(
    (v: number) => {
      const next = clamp(Math.round(v));
      setPos(next);
      onChange?.(next);
    },
    [onChange],
  );

  const fromPointer = (clientX: number) => {
    const r = area.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    set(((clientX - r.left) / r.width) * 100);
  };

  const onPointerDown = (e: PointerEvent) => {
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    fromPointer(e.clientX);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (dragging.current) fromPointer(e.clientX);
  };
  const onPointerUp = () => {
    dragging.current = false;
  };

  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 20 : 5;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") set(pos - step);
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") set(pos + step);
    else if (e.key === "Home") set(0);
    else if (e.key === "End") set(100);
    else return;
    e.preventDefault();
  };

  return (
    <div
      ref={area}
      data-testid="compare-area"
      className={cn("relative w-full select-none overflow-hidden rounded-2xl bg-sand touch-none", className)}
      style={{ aspectRatio: String(aspect) }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <img src={after} alt="After" draggable={false} className="absolute inset-0 size-full object-cover" />
      {overlay && <div className="pointer-events-none absolute inset-0">{overlay}</div>}
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={before} alt="Before" draggable={false} className="absolute inset-0 size-full object-cover" />
      </div>
      <span className="pointer-events-none absolute left-3 top-3 rounded-lg bg-white/90 px-2.5 py-1 text-sm font-bold text-ink shadow-sm">{beforeLabel}</span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-lg bg-white/90 px-2.5 py-1 text-sm font-bold text-ink shadow-sm">{afterLabel}</span>
      <div className="pointer-events-none absolute inset-y-0 w-1 -translate-x-1/2 bg-white shadow" style={{ left: `${pos}%` }} />
      <div
        role="slider"
        tabIndex={0}
        aria-label="Compare before and after"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pos}
        onKeyDown={onKey}
        className="absolute top-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full bg-white text-ink shadow-lg focus-visible:outline-2 focus-visible:outline-forest"
        style={{ left: `${pos}%` }}
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" />
        </svg>
      </div>
    </div>
  );
}
