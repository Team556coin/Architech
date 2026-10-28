"use client";

import { colorForNumber, getItem, type Drawing, type Point } from "@architech/core";
import { standingTops, type GroundModel } from "@architech/measure";
import type Konva from "konva";
import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Image as KImage, Label, Layer, Line, Stage, Tag, Text } from "react-konva";
import { addStroke, appendPoint, canFinish, createDrawing, extendStroke, isTapToDraw, movePoint, scaleAround, shapeCenter, translate } from "@/lib/drawing-tools";

export interface DrawCanvasProps {
  imageUrl: string;
  aspect: number;
  drawings: Drawing[];
  /** commit=false while dragging (no undo step yet) */
  onChange: (next: Drawing[], commit: boolean) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Item to place on the next tap. */
  activeItem: string | null;
  onPlaced: (d: Drawing) => void;
  draftId: string | null;
  onDraft: (id: string | null) => void;
  brush: { size: number; erase: boolean };
  model: GroundModel | null;
  zoom: number;
}

const alpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export default function DrawCanvas(props: DrawCanvasProps) {
  const { imageUrl, aspect, drawings, onChange, selectedId, onSelect, activeItem, onPlaced, draftId, onDraft, brush, model, zoom } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const stage = useRef<Konva.Stage>(null);
  const [W, setW] = useState(0);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const painting = useRef(false);
  const latest = useRef(drawings);
  latest.current = drawings;
  const H = W / aspect;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const i = new window.Image();
    i.onload = () => setImg(i);
    i.src = imageUrl;
  }, [imageUrl]);

  const selected = drawings.find((d) => d.id === selectedId) ?? null;
  const brushTarget = selected?.kind === "brush" ? selected : null;
  const brushMode = !!brushTarget || (activeItem ? getItem(activeItem).kind === "brush" : false);

  const toNorm = (): Point | null => {
    const p = stage.current?.getRelativePointerPosition();
    if (!p || W === 0) return null;
    return { x: Math.min(1, Math.max(0, p.x / W)), y: Math.min(1, Math.max(0, p.y / H)) };
  };

  const replace = (d: Drawing, commit: boolean) => onChange(latest.current.map((x) => (x.id === d.id ? d : x)), commit);

  const onTap = (e: Konva.KonvaEventObject<PointerEvent>) => {
    if (brushMode) return;
    const p = toNorm();
    if (!p) return;
    const draft = drawings.find((d) => d.id === draftId);
    if (draft) {
      const last = draft.points.at(-1);
      const sameSpot = last && Math.hypot((last.x - p.x) * aspect, last.y - p.y) < 0.015;
      if (sameSpot) {
        if (canFinish(draft)) onDraft(null);
        return;
      }
      replace(appendPoint(draft, p, model), true);
      return;
    }
    const onShape = e.target !== e.target.getStage() && e.target.name() !== "photo";
    if (activeItem && !onShape) {
      const d = createDrawing(activeItem, drawings, model, p);
      onChange([...drawings, d], true);
      onSelect(d.id);
      onPlaced(d);
      if (isTapToDraw(d)) onDraft(d.id);
      return;
    }
    if (!onShape) onSelect(null);
  };

  const onDown = () => {
    if (!brushMode) return;
    const p = toNorm();
    if (!p) return;
    painting.current = true;
    if (brushTarget) {
      replace(addStroke(brushTarget, p, brush.size, brush.erase), false);
    } else if (activeItem) {
      const d = addStroke(createDrawing(activeItem, drawings, model, p), p, brush.size, false);
      onChange([...drawings, d], false);
      onSelect(d.id);
      onPlaced(d);
    }
  };
  const onMove = () => {
    const p = toNorm();
    if (draftId) setHover(p);
    if (!painting.current || !p) return;
    const t = latest.current.find((d) => d.id === selectedId && d.kind === "brush");
    if (t) replace(extendStroke(t, p), false);
  };
  const onUp = () => {
    if (painting.current) {
      painting.current = false;
      onChange(latest.current, true);
    }
  };

  const px = (p: Point) => [p.x * W, p.y * H] as const;
  const flat = (pts: Point[]) => pts.flatMap((p) => [p.x * W, p.y * H]);
  const handleR = Math.max(7, W / 110) / zoom;

  const stagePos = useMemo(() => {
    if (zoom <= 1 || !selected) return { x: 0, y: 0 };
    const c = shapeCenter(selected);
    return { x: Math.min(0, Math.max(W - W * zoom, W / 2 - c.x * W * zoom)), y: Math.min(0, Math.max(H - H * zoom, H / 2 - c.y * H * zoom)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, W, H]);

  return (
    <div ref={wrap} className="relative w-full overflow-hidden rounded-2xl bg-sand touch-none select-none" style={{ aspectRatio: String(aspect) }} data-testid="draw-canvas">
      {W > 0 && (
        <Stage
          ref={stage}
          width={W}
          height={H}
          scaleX={zoom}
          scaleY={zoom}
          x={stagePos.x}
          y={stagePos.y}
          draggable={zoom > 1 && !brushMode}
          dragDistance={6}
          dragBoundFunc={(pos) => ({ x: Math.min(0, Math.max(W - W * zoom, pos.x)), y: Math.min(0, Math.max(H - H * zoom, pos.y)) })}
          onPointerClick={onTap}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={() => {
            setHover(null);
            onUp();
          }}
          style={{ cursor: activeItem || draftId ? "crosshair" : "default" }}
        >
          <Layer listening>{img && <KImage image={img} width={W} height={H} name="photo" />}</Layer>
          <Layer>
            {drawings.map((d) => {
              const color = colorForNumber(d.number).hex;
              const item = getItem(d.itemType);
              const isSel = d.id === selectedId;
              const zone = d.zoneHeight * H;
              if (d.kind === "brush") {
                return (
                  <Group key={d.id} onPointerClick={() => onSelect(d.id)}>
                    {(d.strokes ?? []).map((s, i) => (
                      <Line
                        key={i}
                        points={s.points.length === 1 ? [...flat(s.points), ...flat(s.points)] : flat(s.points)}
                        stroke={alpha(color, 0.62)}
                        strokeWidth={s.size * W}
                        lineCap="round"
                        lineJoin="round"
                        tension={0.3}
                        globalCompositeOperation={s.erase ? "destination-out" : "source-over"}
                      />
                    ))}
                  </Group>
                );
              }
              const pts = d.points;
              const closed = d.kind === "area";
              const topYs = item.tall ? standingTops(d, model) : null;
              const top = pts.map((p, i) => ({ x: p.x, y: topYs?.[i] ?? p.y - d.zoneHeight }));
              let anchorI = 0;
              pts.forEach((p, i) => {
                if (p.y > pts[anchorI]!.y) anchorI = i;
              });
              const anchor = pts[anchorI] ?? null;
              const labelAt = pts.length ? (d.kind === "line" ? pts.at(-1)! : pts.reduce((a, b) => (b.y < a.y || (b.y === a.y && b.x < a.x) ? b : a))) : null;
              return (
                <Group key={d.id}>
                  {item.tall && zone > 0 && pts.length >= 2 && (
                    <>
                      {d.kind === "line" ? (
                        <Line points={[...flat(pts), ...flat([...top].reverse())]} closed fill={alpha(color, 0.3)} stroke={alpha(color, 0.75)} strokeWidth={1.5 / zoom} listening={false} />
                      ) : (
                        <>
                          <Line points={flat(top)} closed fill={alpha(color, 0.18)} stroke={alpha(color, 0.8)} strokeWidth={1.5 / zoom} listening={false} />
                          {pts.map((p, i) => (
                            <Line key={i} points={[...px(p), ...px(top[i]!)]} stroke={alpha(color, 0.8)} strokeWidth={1.5 / zoom} listening={false} />
                          ))}
                        </>
                      )}
                    </>
                  )}
                  <Line
                    points={flat(pts)}
                    closed={closed && !(d.id === draftId)}
                    fill={closed ? alpha(color, 0.42) : undefined}
                    stroke={color}
                    strokeWidth={(d.kind === "line" ? 4 : 3) / zoom}
                    hitStrokeWidth={24 / zoom}
                    lineJoin="round"
                    lineCap="round"
                    draggable={isSel && !draftId && d.kind === "area"}
                    onPointerClick={() => onSelect(d.id)}
                    onDragEnd={(e) => {
                      const node = e.target;
                      const dx = node.x() / W;
                      const dy = node.y() / H;
                      node.position({ x: 0, y: 0 });
                      replace(translate(d, dx, dy), true);
                    }}
                  />
                  {d.id === draftId && hover && pts.length > 0 && <Line points={[...px(pts.at(-1)!), ...px(hover)]} stroke={color} strokeWidth={2 / zoom} dash={[8 / zoom, 6 / zoom]} listening={false} />}
                  {isSel &&
                    !draftId &&
                    (d.shape === "ellipse"
                      ? ellipseHandles(d).map((h) => (
                          <Circle
                            key={h.key}
                            x={h.p.x * W}
                            y={h.p.y * H}
                            radius={handleR}
                            fill="#fff"
                            stroke={color}
                            strokeWidth={3 / zoom}
                            draggable
                            onDragMove={(e) => {
                              const c = shapeCenter(d);
                              const nx = e.target.x() / W;
                              const ny = e.target.y() / H;
                              const sx = h.axis === "x" ? Math.max(0.1, Math.abs(nx - c.x) / Math.max(1e-6, Math.abs(h.p.x - c.x))) : 1;
                              const sy = h.axis === "y" ? Math.max(0.1, Math.abs(ny - c.y) / Math.max(1e-6, Math.abs(h.p.y - c.y))) : 1;
                              replace(scaleAround(d, c, sx, sy), false);
                            }}
                            onDragEnd={() => onChange(latest.current, true)}
                          />
                        ))
                      : pts.map((p, i) => (
                          <Circle
                            key={i}
                            x={p.x * W}
                            y={p.y * H}
                            radius={handleR}
                            fill="#fff"
                            stroke={color}
                            strokeWidth={3 / zoom}
                            draggable
                            onDragMove={(e) => replace(movePoint(d, i, { x: e.target.x() / W, y: e.target.y() / H }), false)}
                            onDragEnd={() => onChange(latest.current, true)}
                          />
                        )))}
                  {d.id === draftId &&
                    pts.map((p, i) => <Circle key={`d${i}`} x={p.x * W} y={p.y * H} radius={handleR * 0.8} fill="#fff" stroke={color} strokeWidth={3 / zoom} listening={false} />)}
                  {item.tall && isSel && !draftId && anchor && pts.length >= 2 && (
                    <Label
                      x={anchor.x * W}
                      y={(top[anchorI]?.y ?? anchor.y - d.zoneHeight) * H}
                      draggable
                      dragBoundFunc={function (this: Konva.Node, pos) {
                        return { x: this.absolutePosition().x, y: pos.y };
                      }}
                      onDragMove={(e) => {
                        const ny = e.target.y() / H;
                        const zoneHeight = Math.min(0.95, Math.max(0.03, anchor.y - ny));
                        const heightM = model ? model.heightAt(anchor, { x: anchor.x, y: anchor.y - zoneHeight }) : null;
                        replace({ ...d, zoneHeight, dims: heightM ? { ...d.dims, heightM: Math.round(heightM * 100) / 100 } : d.dims }, false);
                      }}
                      onDragEnd={(e) => {
                        const latestD = latest.current.find((x) => x.id === d.id)!;
                        const y = standingTops(latestD, model)?.[anchorI] ?? anchor.y - latestD.zoneHeight;
                        e.target.position({ x: anchor.x * W, y: y * H });
                        onChange(latest.current, true);
                      }}
                    >
                      <Tag fill={color} cornerRadius={8 / zoom} pointerDirection="down" pointerWidth={10 / zoom} pointerHeight={6 / zoom} />
                      <Text text="Height ↕" fill="#fff" fontStyle="bold" fontSize={14 / zoom} padding={6 / zoom} fontFamily="Nunito, system-ui" />
                    </Label>
                  )}
                  {labelAt && (
                    <Label x={labelAt.x * W} y={labelAt.y * H - 12 / zoom} listening={false}>
                      <Tag fill={color} cornerRadius={8 / zoom} pointerDirection="down" pointerWidth={8 / zoom} pointerHeight={6 / zoom} />
                      <Text text={`${d.number} ${d.itemType === "other" && d.note ? d.note.slice(0, 18) : item.label}`} fill="#fff" fontStyle="bold" fontSize={15 / zoom} padding={6 / zoom} fontFamily="Nunito, system-ui" />
                    </Label>
                  )}
                </Group>
              );
            })}
          </Layer>
        </Stage>
      )}
    </div>
  );
}

function ellipseHandles(d: Drawing) {
  const c = shapeCenter(d);
  const xs = d.points.map((p) => p.x);
  const ys = d.points.map((p) => p.y);
  return [
    { key: "l", axis: "x" as const, p: { x: Math.min(...xs), y: c.y } },
    { key: "r", axis: "x" as const, p: { x: Math.max(...xs), y: c.y } },
    { key: "t", axis: "y" as const, p: { x: c.x, y: Math.min(...ys) } },
    { key: "b", axis: "y" as const, p: { x: c.x, y: Math.max(...ys) } },
  ];
}
