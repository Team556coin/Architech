"use client";

import type { Calibration, Point, Reference } from "@architech/core";
import { formatLength } from "@architech/measure";
import { Pencil } from "lucide-react";
import { useRef, useState, type PointerEvent } from "react";

export type CalTool = "none" | "measure" | "floor";

export interface CalibrateStageProps {
  imageUrl: string;
  aspect: number;
  calibration: Calibration;
  tool: CalTool;
  /** The line whose size is being typed in, highlighted until saved or cancelled. */
  pending?: { a: Point; b: Point } | null;
  /** A new line was drawn with the Measure tool. */
  onMeasured: (a: Point, b: Point) => void;
  onFloorCorners: (corners: [Point, Point, Point, Point]) => void;
  onConfirm: (ref: Reference) => void;
  onFix: (ref: Reference) => void;
  onEdit: (ref: Reference) => void;
}

const GREEN = "#16a34a";
const CORAL = "#F07A5A";
const FLOOR_LABELS = ["back-left", "back-right", "front-right", "front-left"];

export function CalibrateStage({ imageUrl, aspect, calibration, tool, pending, onMeasured, onFloorCorners, onConfirm, onFix, onEdit }: CalibrateStageProps) {
  const box = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState<Point | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [corners, setCorners] = useState<Point[]>([]);
  const units = calibration.units;
  const W = 1000;
  const H = 1000 / aspect;

  const norm = (e: PointerEvent): Point | null => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return null;
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  const onDown = (e: PointerEvent) => {
    const p = norm(e);
    if (!p) return;
    if (tool === "measure") {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setStart(p);
      setCursor(p);
    } else if (tool === "floor") {
      const next = [...corners, p];
      if (next.length === 4) {
        setCorners([]);
        onFloorCorners(next as [Point, Point, Point, Point]);
      } else setCorners(next);
    }
  };
  const onMove = (e: PointerEvent) => {
    if (start) setCursor(norm(e));
  };
  const onUp = (e: PointerEvent) => {
    if (!start) return;
    const p = norm(e) ?? cursor;
    setStart(null);
    setCursor(null);
    if (p && Math.hypot((p.x - start.x) * aspect, p.y - start.y) > 0.03) onMeasured(start, p);
  };

  const refs = calibration.references;
  const estimated = refs.find((r) => r.source === "estimated");
  const fr = calibration.floorRect;

  return (
    <div
      ref={box}
      className="relative w-full select-none overflow-hidden rounded-2xl bg-sand touch-none"
      style={{ aspectRatio: String(aspect), cursor: tool !== "none" ? "crosshair" : "default" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      data-testid="calibrate-stage"
    >
      <img src={imageUrl} alt="Your photo" className="absolute inset-0 size-full object-cover" draggable={false} />
      <svg viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 size-full">
        {fr && <polygon points={fr.corners.map((c) => `${c.x * W},${c.y * H}`).join(" ")} fill="rgba(22,163,74,0.18)" stroke={GREEN} strokeWidth={2.5} />}
        {refs.map((r) => {
          const user = r.source === "user";
          return (
            <g key={r.id}>
              <line x1={r.a.x * W} y1={r.a.y * H} x2={r.b.x * W} y2={r.b.y * H} stroke="rgba(0,0,0,0.45)" strokeWidth={6} strokeLinecap="round" />
              <line
                x1={r.a.x * W}
                y1={r.a.y * H}
                x2={r.b.x * W}
                y2={r.b.y * H}
                stroke={GREEN}
                strokeWidth={3}
                strokeDasharray={user ? undefined : "8 6"}
                strokeLinecap="round"
              />
            </g>
          );
        })}
        {pending && (
          <g data-testid="pending-measure">
            <line x1={pending.a.x * W} y1={pending.a.y * H} x2={pending.b.x * W} y2={pending.b.y * H} stroke={CORAL} strokeWidth={4} strokeLinecap="round" />
            {[pending.a, pending.b].map((p, i) => (
              <circle key={i} cx={p.x * W} cy={p.y * H} r={7} fill="#fff" stroke={CORAL} strokeWidth={3} />
            ))}
          </g>
        )}
        {start && cursor && <line x1={start.x * W} y1={start.y * H} x2={cursor.x * W} y2={cursor.y * H} stroke={GREEN} strokeWidth={3} strokeDasharray="6 5" />}
        {corners.map((c, i) => (
          <circle key={i} cx={c.x * W} cy={c.y * H} r={8} fill="#fff" stroke={GREEN} strokeWidth={3} />
        ))}
      </svg>
      {refs.map((r) => {
        const mx = ((r.a.x + r.b.x) / 2) * 100;
        const my = ((r.a.y + r.b.y) / 2) * 100;
        const user = r.source === "user";
        return (
          <button
            key={r.id}
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onEdit(r)}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-lg border border-white/70 px-2 py-1 text-[13px] font-bold text-white shadow md:text-sm"
            style={{ left: `${mx}%`, top: `${my}%`, background: user ? GREEN : "rgba(22,101,52,0.85)" }}
          >
            <span className="inline-flex items-center gap-1">
              {user ? "" : "≈ "}
              {formatLength(r.lengthM, units, { preferInches: r.lengthM < 3 })}
              {user ? <Pencil className="size-3.5" /> : " (estimated)"}
            </span>
          </button>
        );
      })}
      {estimated && tool === "none" && (
        <div
          className="absolute z-10 w-44 -translate-x-1/2 rounded-2xl bg-white p-3 text-center shadow-xl"
          style={{ left: `${Math.min(80, Math.max(20, ((estimated.a.x + estimated.b.x) / 2) * 100))}%`, top: `${Math.max(4, Math.min(estimated.a.y, estimated.b.y) * 100 - 26)}%` }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <p className="text-sm font-semibold">
            Is this right?{estimated.label ? <span className="block truncate text-xs text-muted">{estimated.label}</span> : null}
          </p>
          <div className="mt-2 flex justify-center gap-2">
            <button type="button" onClick={() => onConfirm(estimated)} className="h-8 rounded-lg border border-line px-3 text-sm font-bold">
              Yes
            </button>
            <button type="button" onClick={() => onFix(estimated)} className="h-8 rounded-lg bg-forest px-3 text-sm font-bold text-white">
              Fix it
            </button>
          </div>
        </div>
      )}
      {tool === "floor" && (
        <p className="absolute left-3 top-3 rounded-xl bg-white/95 px-3 py-2 text-sm font-semibold shadow">
          Tap the {FLOOR_LABELS[corners.length]} corner of the floor ({corners.length + 1} of 4)
        </p>
      )}
      {tool === "measure" && !start && (
        <p className="absolute left-3 top-3 rounded-xl bg-white/95 px-3 py-2 text-sm font-semibold shadow">Drag along something you know the size of</p>
      )}
    </div>
  );
}
