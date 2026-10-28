"use client";

import { useRef, useState } from "react";
import { worldPoints, type DesignAlternative, type DesignItem } from "@architech/core";

const colors = ["#77aa96", "#e4aa78", "#84aaca", "#c4a0ba", "#b1b675", "#99b9b3"];
type P = { x: number; z: number };

export function DesignCanvas({ design, selected, onSelect, onMove, onRoutePoint, view, photo, photoPoints }: {
  design: DesignAlternative; selected: string | null; onSelect: (id: string) => void;
  onMove: (id: string, x: number, z: number, commit: boolean) => void;
  onRoutePoint: (id: string, index: number, x: number, z: number, commit: boolean) => void;
  view: "plan" | "3d" | "photo"; photo?: string;
  photoPoints?: (item: DesignItem) => { x: number; y: number }[] | null;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; x: number; z: number; px: number; pz: number; index?: number } | null>(null);
  const [angle, setAngle] = useState(35);
  const toWorld = (clientX: number, clientY: number) => {
    const m = svg.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: p.x, z: p.y };
  };
  if (view === "photo") return <div className="relative overflow-hidden rounded-2xl bg-sand">
    {photo ? <img src={photo} alt="Design reference photo" className="w-full" /> : <p className="p-8">Add a photo to compare this layout with your space.</p>}
    {photo && design.photoAligned && <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-label="Photo placement overlay">
      {design.items.map((i, index) => {
        const points = photoPoints?.(i);
        if (!points) return null;
        const pts = points.map((p) => `${p.x},${p.y}`).join(" ");
        return <g key={i.id} onClick={() => onSelect(i.id)}>{i.shape === "path" ? <polyline points={pts + (i.closed ? ` ${pts.split(" ")[0]}` : "")} fill="none" stroke={selected === i.id ? "#ed7756" : "#245c4b"} strokeWidth={0.004} /> : <polygon points={pts} fill={colors[index % colors.length]} fillOpacity={0.3} stroke={selected === i.id ? "#ed7756" : "#245c4b"} strokeWidth={0.004} />}</g>;
      })}
    </svg>}
    {!design.photoAligned && <p className="p-3 text-sm">Reference only. Align the layout to measured photo marks before overlaying positions.</p>}
  </div>;

  if (view === "3d") {
    const rad = angle * Math.PI / 180;
    const project = (p: P, h: number) => ({ x: p.x * Math.cos(rad) - p.z * Math.sin(rad), y: (p.x * Math.sin(rad) + p.z * Math.cos(rad)) * 0.5 - h });
    const ground = [{ x: 0, z: 0 }, { x: design.width, z: 0 }, { x: design.width, z: design.depth }, { x: 0, z: design.depth }].map((p) => project(p, 0));
    const faces: { id: string; points: { x: number; y: number }[]; depth: number; color: string; opacity: number }[] = [];
    const box = (item: DesignItem, points: P[], bottom: number, top: number, color: string) => {
      for (let n = 0; n < points.length; n++) {
        const a = points[n]!, b = points[(n + 1) % points.length]!;
        faces.push({ id: item.id, points: [project(a, bottom), project(b, bottom), project(b, top), project(a, top)], depth: (a.x + b.x) / 2 * Math.sin(rad) + (a.z + b.z) / 2 * Math.cos(rad), color, opacity: 0.7 });
      }
      faces.push({ id: item.id, points: points.map((p) => project(p, top)), depth: points.reduce((s, p) => s + p.x * Math.sin(rad) + p.z * Math.cos(rad), 0) / points.length + 0.001, color, opacity: 1 });
    };
    for (const [index, item] of design.items.entries()) {
      const points = worldPoints(item), color = item.operation === "remove" ? "#e8a39a" : colors[index % colors.length]!;
      if (item.shape === "path") {
        const route = item.closed ? [...points, points[0]!] : points;
        for (let n = 1; n < route.length; n++) {
          const a = route[n - 1]!, b = route[n]!, length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
          const dx = (b.z - a.z) / length * item.width / 2, dz = -(b.x - a.x) / length * item.width / 2;
          box(item, [{ x: a.x + dx, z: a.z + dz }, { x: b.x + dx, z: b.z + dz }, { x: b.x - dx, z: b.z - dz }, { x: a.x - dx, z: a.z - dz }], item.elevation, item.elevation + (item.type === "lazy-river" ? 0.05 : item.height), color);
        }
      } else if (["pergola", "gazebo", "patio-cover"].includes(item.type)) {
        const top = item.elevation + item.height;
        for (const p of points.slice(0, 4)) box(item, [{ x: p.x - 0.07, z: p.z - 0.07 }, { x: p.x + 0.07, z: p.z - 0.07 }, { x: p.x + 0.07, z: p.z + 0.07 }, { x: p.x - 0.07, z: p.z + 0.07 }], item.elevation, top, color);
        box(item, points, top, top + 0.15, color);
      } else box(item, points, item.elevation, item.elevation + item.height, color);
    }
    faces.sort((a, b) => a.depth - b.depth);
    const all = [...ground, ...faces.flatMap((f) => f.points)];
    const minX = Math.min(...all.map((p) => p.x)) - 1, minY = Math.min(...all.map((p) => p.y)) - 1;
    const w = Math.max(...all.map((p) => p.x)) - minX + 1, h = Math.max(...all.map((p) => p.y)) - minY + 1;
    return <div><svg viewBox={`${minX} ${minY} ${w} ${h}`} className="aspect-[4/3] w-full rounded-2xl bg-sand" aria-label="3D design layout">
      <polygon points={ground.map((p) => `${p.x},${p.y}`).join(" ")} fill="#e4e9df" stroke="#7b9285" strokeWidth={0.03} />
      {faces.map((f, n) => <polygon key={n} points={f.points.map((p) => `${p.x},${p.y}`).join(" ")} fill={f.color} fillOpacity={f.opacity} stroke={selected === f.id ? "#e95d3f" : "#345c4c"} strokeWidth={selected === f.id ? 0.06 : 0.02} onClick={() => onSelect(f.id)} />)}
    </svg><label className="mt-3 flex items-center gap-3 text-sm">Rotate view<input aria-label="Rotate 3D view" type="range" min="0" max="360" value={angle} onChange={(e) => setAngle(Number(e.target.value))} className="flex-1" /></label><p className="mt-2 text-xs text-muted">3D massing model shows placement and height. Roof details, furniture shapes and terrain between elevations are conceptual.</p></div>;
  }
  const unitScale = design.units === "imperial" ? 1 / 0.3048 : 1;
  return <svg ref={svg} viewBox={`-1 -1 ${design.width + 2} ${design.depth + 2}`} className="aspect-[4/3] w-full touch-none rounded-2xl bg-sand" role="img" aria-label="Editable top-down plan"
    onPointerMove={(e) => { const d = drag.current, p = toWorld(e.clientX, e.clientY); if (d && p) { if (d.index !== undefined) onRoutePoint(d.id, d.index, d.x + p.x - d.px, d.z + p.z - d.pz, false); else onMove(d.id, d.x + p.x - d.px, d.z + p.z - d.pz, false); } }}
    onPointerUp={(e) => { const d = drag.current, p = toWorld(e.clientX, e.clientY); drag.current = null; if (d && p) { if (d.index !== undefined) onRoutePoint(d.id, d.index, d.x + p.x - d.px, d.z + p.z - d.pz, true); else onMove(d.id, d.x + p.x - d.px, d.z + p.z - d.pz, true); } }}
    onPointerCancel={() => { const d = drag.current; drag.current = null; if (d) { if (d.index !== undefined) onRoutePoint(d.id, d.index, d.x, d.z, true); else onMove(d.id, d.x, d.z, true); } }}>
    <rect width={design.width} height={design.depth} fill="#f8f8f1" stroke="#7b9285" strokeWidth="0.04" />
    <text x={design.width / 2} y={-0.35} textAnchor="middle" fontSize="0.35">{(design.width * unitScale).toFixed(1)} {design.units === "imperial" ? "ft" : "m"}</text>
    {design.items.map((item, index) => {
      const points = worldPoints(item), pts = [...points, ...(item.shape === "path" && item.closed ? [points[0]!] : [])].map((p) => `${p.x},${p.z}`).join(" ");
      return <g key={item.id} tabIndex={0} role="button" aria-label={`Select ${item.name}`} style={{ cursor: item.locked ? "pointer" : "grab" }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(item.id); } }}
        onPointerDown={(e) => { e.stopPropagation(); onSelect(item.id); const p = toWorld(e.clientX, e.clientY); if (!item.locked && p) { drag.current = { id: item.id, x: item.x, z: item.z, px: p.x, pz: p.z }; svg.current?.setPointerCapture(e.pointerId); } }}>
        {item.clearance > 0 && <rect x={Math.min(...points.map((p) => p.x)) - item.clearance} y={Math.min(...points.map((p) => p.z)) - item.clearance} width={Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)) + item.clearance * 2} height={Math.max(...points.map((p) => p.z)) - Math.min(...points.map((p) => p.z)) + item.clearance * 2} fill="#ffe6ad" fillOpacity="0.3" stroke="#b79037" strokeWidth="0.025" strokeDasharray="0.12" />}
        {item.shape === "path" ? <polyline points={pts} fill="none" stroke={colors[index % colors.length]} strokeWidth={item.width} strokeLinejoin="round" /> : <polygon points={pts} fill={colors[index % colors.length]} fillOpacity="0.65" />}
        <polyline points={pts + (item.shape !== "path" ? ` ${pts.split(" ")[0]}` : "")} fill="none" stroke={selected === item.id ? "#e95d3f" : "#245c4b"} strokeWidth={selected === item.id ? 0.07 : 0.03} strokeDasharray={item.operation === "remove" ? "0.15" : undefined} />
        <text x={item.x} y={item.z} textAnchor="middle" fontSize="0.32" fill="#16392d" pointerEvents="none">{index + 1}. {item.name}</text>
        {selected === item.id && item.shape === "path" && !item.locked && worldPoints({ ...item, curved: false }).map((p, index) => <circle key={index} cx={p.x} cy={p.z} r={0.16} fill="white" stroke="#e95d3f" strokeWidth={0.05} onPointerDown={(e) => { e.stopPropagation(); const start = toWorld(e.clientX, e.clientY); if (start) { drag.current = { id: item.id, x: p.x, z: p.z, px: start.x, pz: start.z, index }; svg.current?.setPointerCapture(e.pointerId); } }} />)}
      </g>;
    })}
  </svg>;
}
