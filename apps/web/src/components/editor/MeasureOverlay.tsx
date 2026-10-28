import type { DrawingOverlay } from "@/lib/measure-view";

/** Dimension lines with labels drawn over the photo (Measurements on). */
export function MeasureOverlay({ overlays, aspect }: { overlays: DrawingOverlay[]; aspect: number }) {
  const W = 1000;
  const H = 1000 / aspect;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 size-full" aria-label="Measurements" role="img">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="#fff" />
        </marker>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.6" floodColor="#000" floodOpacity="0.55" />
        </filter>
      </defs>
      {overlays.flatMap((o) =>
        o.lines.map((l, i) => {
          const ax = l.a.x * W;
          const ay = l.a.y * H;
          const bx = l.b.x * W;
          const by = l.b.y * H;
          const mx = (ax + bx) / 2;
          const my = (ay + by) / 2;
          const tw = l.text.length * 8.6 + 18;
          return (
            <g key={`${o.id}-${i}`} data-testid="dimension">
              <line x1={ax} y1={ay} x2={bx} y2={by} stroke="#fff" strokeWidth={2.6} markerStart="url(#arrow)" markerEnd="url(#arrow)" filter="url(#shadow)" />
              <rect x={mx - tw / 2} y={my - 14} width={tw} height={28} rx={8} fill="rgba(29,42,36,0.88)" stroke="#fff" strokeWidth={1.2} />
              <text x={mx} y={my + 5.5} textAnchor="middle" fontSize={16} fontWeight={700} fill="#fff" fontFamily="Nunito, system-ui, sans-serif">
                {l.text}
              </text>
            </g>
          );
        }),
      )}
    </svg>
  );
}
