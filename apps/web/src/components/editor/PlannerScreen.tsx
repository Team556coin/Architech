"use client";

import { CATALOG, DESIGN_STEPS, getItem, designAlternativeSchema, designChecks, designItemSchema, designQuantity, newDesignItem, planningSchema, worldPoints, type DesignAlternative, type DesignItem, type Planning } from "@architech/core";
import { buildGroundModel, parseLength, formatLength } from "@architech/measure";
import { Button } from "@architech/ui";
import { useEffect, useRef, useState } from "react";
import { history, type History } from "@/lib/editor-logic";
import { initialPlanning, planningPacket } from "@/lib/planning";
import { isNative, shareNativeImage } from "@/lib/native";
import { api } from "@/lib/api";
import { loadProject } from "@/lib/projects";
import { uid } from "@/lib/uid";
import type { CProject, CVersion } from "@/lib/types";
import { DesignCanvas } from "./DesignCanvas";
import { PhotoPicker, type PhotoPickerHandle } from "../PhotoPicker";
import { preparePhoto } from "@/lib/images";

export function PlannerScreen({ project, selectedVersion, onClose, onSave, onPreview, onMeasure }: {
  project: CProject; selectedVersion: CVersion | null; onClose: () => void;
  onSave: (p: Planning, expected: number) => Promise<void>;
  onPreview: (a: DesignAlternative) => void; onMeasure: () => void;
}) {
  const key = `homeredo:plan:${project.id}`;
  const draft = useRef<{ planning: Planning; expected: number } | null>(null);
  const [state, setState] = useState<History<Planning>>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) { const d = JSON.parse(raw); const parsed = planningSchema.safeParse(d.planning); if (parsed.success && Number.isInteger(d.expected)) draft.current = { planning: parsed.data, expected: d.expected }; }
    } catch { /* blocked storage */ }
    return history.init(draft.current?.planning ?? initialPlanning(project, selectedVersion));
  });
  const [expected, setExpected] = useState(draft.current?.expected ?? project.planning?.revision ?? 0);
  const [lastSaved, setLastSaved] = useState(JSON.stringify(project.planning ?? null));
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"plan" | "3d" | "photo">("plan");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [compare, setCompare] = useState(false);
  const [moveGroup, setMoveGroup] = useState(false);
  const picker = useRef<PhotoPickerHandle>(null);
  const plan = state.present;
  const revisionCounter = useRef(Math.max(0, ...state.present.alternatives.map((a) => a.revision), ...project.versions.map((v) => v.request?.design?.revision ?? 0)) + 1);
  const alternative = plan.alternatives.find((a) => a.id === plan.activeId)!;
  const item = alternative.items.find((i) => i.id === selected);
  const dirty = JSON.stringify(plan) !== lastSaved;
  const busy = saving || thinking;
  const model = project.calibration ? buildGroundModel(project.calibration) : null;
  const photoVersion = project.versions.find((v) => v.number === alternative.baseVersionNumber) ?? selectedVersion;
  const reference = plan.photos.find((p) => p.id === alternative.referenceId);
  const previews = project.versions.filter((v) => v.request?.design?.id === alternative.id);
  const currentPreview = previews.findLast((v) => v.request?.design?.revision === alternative.revision);

  useEffect(() => {
    try { if (dirty) localStorage.setItem(key, JSON.stringify({ planning: plan, expected })); else localStorage.removeItem(key); } catch { /* server save remains available */ }
    const leave = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [plan, expected, key, dirty]);

  const change = (fn: (a: DesignAlternative) => DesignAlternative, commit = true) => {
    if (busy) return;
    setState((h) => {
      const p = h.present;
      const next = { ...p, alternatives: p.alternatives.map((a) => a.id === p.activeId ? { ...fn(a), revision: revisionCounter.current++ } : a) };
      return commit ? history.push(h, next) : history.set(h, next);
    });
  };
  const updateItem = (id: string, patch: Partial<DesignItem>, commit = true) => change((a) => ({ ...a, items: a.items.map((i) => i.id === id && (!i.locked || Object.keys(patch).every((k) => k === "locked")) ? (designItemSchema.safeParse({ ...i, ...patch, ...(["width", "height", "depth"].some((k) => k in patch) ? { source: "desired" } : {}) }).data ?? i) : i) }), commit);
  const add = (type: string) => {
    if (alternative.items.length >= 60) return setNotice("This alternative has 60 items. Create another alternative to keep exploring.");
    const next = newDesignItem(type, uid()); next.x = alternative.width / 2; next.z = alternative.depth / 2;
    change((a) => ({ ...a, items: [...a.items, next] })); setSelected(next.id); setSearch("");
  };
  const move = (id: string, x: number, z: number, commit: boolean) => {
    const i = alternative.items.find((i) => i.id === id);
    if (!i) return;
    if (moveGroup && i.group) {
      if (alternative.items.some((other) => other.group === i.group && other.locked)) { setNotice("Unlock all members before moving this group."); return; }
      const dx = x - i.x, dz = z - i.z;
      change((a) => ({ ...a, items: a.items.map((other) => other.group === i.group ? { ...other, x: Math.max(-999, Math.min(999, other.x + dx)), z: Math.max(-999, Math.min(999, other.z + dz)) } : other) }), commit);
    } else updateItem(id, { x: Math.max(-999, Math.min(999, x)), z: Math.max(-999, Math.min(999, z)) }, commit);
  };
  const save = async () => {
    setSaving(true); setNotice("");
    try { const parsed = planningSchema.safeParse({ ...plan, revision: expected + 1 }); if (!parsed.success) throw new Error(`Check your plan: ${parsed.error.issues[0]?.path.join(" / ")} — ${parsed.error.issues[0]?.message}`); const snapshot = parsed.data; await onSave(snapshot, expected); setExpected(snapshot.revision); setState(history.init(snapshot)); setLastSaved(JSON.stringify(snapshot)); setNotice(project.where === "device" ? "Saved on this device. Move the project online to use it on another device." : "Plan saved online."); return snapshot; }
    catch (e) { setNotice(e instanceof Error ? e.message : "Could not save. Your draft is still here."); return null; }
    finally { setSaving(false); }
  };
  const exportPlan = async () => {
    try {
      let photo = "";
      if (reference) photo = reference.dataUrl;
      else if (photoVersion?.url) {
        const blob = await api.fetchBlob(photoVersion.url);
        photo = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(blob); });
      }
      const blob = new Blob([planningPacket(project.title, plan, alternative, photo)], { type: "text/html" });
      if (isNative()) await shareNativeImage(blob, "HomeRedo-project-plan.html", "Share project plan");
      else { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "HomeRedo-project-plan.html"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch (e) { setNotice(e instanceof Error ? e.message : "Could not export the plan."); }
  };
  const addPhoto = async (file: Blob & { name?: string }) => {
    if (plan.photos.length >= 4) return setNotice("Up to four reference photos can be saved with a project.");
    setThinking(true);
    try {
      const prepared = await preparePhoto(file);
      const url = URL.createObjectURL(prepared.blob);
      try {
        const image = new Image(); image.src = url; await image.decode();
        const canvas = document.createElement("canvas"), scale = Math.min(1, 900 / Math.max(image.width, image.height));
        canvas.width = image.width * scale; canvas.height = image.height * scale;
        canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
        let dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        if (dataUrl.length > 300000) dataUrl = canvas.toDataURL("image/jpeg", 0.4);
        if (dataUrl.length > 300000) throw new Error("This photo has too much detail. Try a smaller photo.");
        const photo = { id: uid(), label: `View ${plan.photos.length + 1}`, dataUrl };
        setState((h) => history.push(h, { ...h.present, photos: [...h.present.photos, photo] }));
      } finally { URL.revokeObjectURL(url); }
    } catch (e) { setNotice(e instanceof Error ? e.message : "Could not add photo."); }
    finally { setThinking(false); }
  };
  const readPreview = async () => {
    if (!selectedVersion) return;
    setThinking(true); setNotice("");
    try {
      const photos = [project.versions[0]!, selectedVersion];
      const photoKeys: string[] = [];
      for (const photo of photos) photoKeys.push((await api.uploadPhoto(await api.fetchBlob(photo.url), { analyze: false })).key);
      const result = await api.design({ design: alternative, message: "Turn the changed and newly added features in this preview into editable design items. Estimate sizes and placements conservatively, preserve existing design items, and do not claim measured dimensions.", selectedId: null, photoKeys });
      setState((h) => history.push(h, { ...h.present, alternatives: h.present.alternatives.map((a) => a.id === alternative.id ? { ...result.design, revision: revisionCounter.current++ } : a) }));
      setNotice(result.reply);
    } catch (e) { setNotice(e instanceof Error ? e.message : "Could not read this preview."); }
    finally { setThinking(false); }
  };
  const ask = async () => {
    if (!message.trim() || busy) return;
    setThinking(true); setNotice("");
    try {
      const result = await api.design({ design: alternative, message, selectedId: selected });
      setState((h) => history.push(h, { ...h.present, alternatives: h.present.alternatives.map((a) => a.id === alternative.id ? { ...result.design, revision: revisionCounter.current++ } : a) }));
      setNotice(result.reply); setMessage("");
    } catch (e) { setNotice(e instanceof Error ? e.message : "Could not update the design."); }
    finally { setThinking(false); }
  };
  const costs = alternative.items.map((i) => designQuantity(i, alternative.units));
  const field = "h-10 w-full rounded-xl border border-line bg-white px-3 text-base";

  return <main className="mx-auto max-w-[1440px] space-y-5 px-4 py-5" data-testid="project-planner">
    <PhotoPicker ref={picker} onPick={(file) => void addPhoto(file)} />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-extrabold text-forest">Plan your project</h1><p className="text-sm text-muted">{project.title} · {dirty ? "Draft changes" : "Saved"} · {project.where === "server" ? "Online" : "This device only"}</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={onClose} disabled={busy}>Back to quick preview</Button><Button onClick={() => void save()} disabled={busy || !dirty}>{saving ? "Saving..." : "Save plan"}</Button><Button variant="outline" onClick={() => void exportPlan()}>Export project packet</Button></div>
    </div>
    {notice && <div className="rounded-xl bg-amber-soft p-3"><p role="status">{notice}</p>{/changed.*(device|tab)/i.test(notice) && <Button variant="outline" size="sm" className="mt-2" onClick={async () => { try { const fresh = await loadProject(project.id); if (fresh?.planning) { setState(history.init(fresh.planning)); setExpected(fresh.planning.revision); setLastSaved(JSON.stringify(fresh.planning)); revisionCounter.current = Math.max(revisionCounter.current, ...fresh.planning.alternatives.map((a) => a.revision + 1)); setNotice("Loaded the saved plan. The conflicting draft was discarded."); } } catch (e) { setNotice(e instanceof Error ? e.message : "Could not load the saved plan."); } }}>Load saved plan and discard this draft</Button>}</div>}
    <fieldset disabled={busy} className="min-w-0 space-y-4">
      <div className="grid gap-3 rounded-2xl border border-line bg-white p-4 sm:grid-cols-4">
        <label>Property<input aria-label="Property" value={plan.property} maxLength={120} className={field} onChange={(e) => setState((h) => history.push(h, { ...h.present, property: e.target.value }))} /></label>
        <label>Area<input aria-label="Project area" value={plan.area} maxLength={120} className={field} onChange={(e) => setState((h) => history.push(h, { ...h.present, area: e.target.value }))} /></label>
        <label>Alternative<select aria-label="Design alternative" value={plan.activeId} className={field} onChange={(e) => { setSelected(null); setState((h) => history.push(h, { ...h.present, activeId: e.target.value })); }}>
          {plan.alternatives.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select></label>
        <label>Name<input aria-label="Alternative name" value={alternative.name} maxLength={80} className={field} onChange={(e) => { if (e.target.value.trim()) change((a) => ({ ...a, name: e.target.value })); }} /></label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={!history.canUndo(state)} onClick={() => setState(history.undo)}>Undo plan change</Button>
        <Button variant="outline" size="sm" disabled={!state.future.length} onClick={() => setState(history.redo)}>Redo plan change</Button>
        <Button variant="outline" size="sm" disabled={plan.alternatives.length >= 12} onClick={() => { const copy = structuredClone(alternative); copy.id = uid(); copy.name = `${copy.name.slice(0, 65)} (copy)`; copy.revision = 0; setState((h) => history.push(h, { ...h.present, activeId: copy.id, alternatives: [...h.present.alternatives, copy] })); }}>Duplicate alternative</Button>
        <Button variant="outline" size="sm" onClick={() => setCompare(!compare)}>Compare alternatives</Button>
        <Button variant="outline" size="sm" disabled={plan.alternatives.length < 2} onClick={() => setState((h) => { const alternatives = h.present.alternatives.filter((a) => a.id !== h.present.activeId); return history.push(h, { ...h.present, alternatives, activeId: alternatives[0]!.id }); })}>Delete alternative</Button>
      </div>
      {compare && <div className="overflow-x-auto rounded-xl border border-line bg-white"><table className="w-full text-left text-sm"><thead><tr><th className="p-3">Alternative</th><th>Items</th><th>Priced subtotal</th><th>Missing prices</th></tr></thead><tbody>{plan.alternatives.map((a) => { const q = a.items.map((i) => designQuantity(i, a.units)); return <tr key={a.id}><td className="p-3">{a.name}</td><td>{a.items.length}</td><td>{a.currency} {q.reduce((s, v) => s + (v.cost ?? 0), 0).toFixed(2)}</td><td>{q.filter((v) => v.cost === null).length}</td></tr>; })}</tbody></table></div>}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">{([['plan', 'Top-down plan'], ['3d', '3D view'], ['photo', 'Photo']] as const).map(([v, label]) => <Button key={v} size="sm" variant={view === v ? "primary" : "outline"} onClick={() => setView(v)}>{label}</Button>)}</div>
          <div style={busy ? { pointerEvents: "none" } : undefined}><DesignCanvas design={alternative} selected={selected} onSelect={setSelected} onMove={move} onRoutePoint={(id, index, x, z, commit) => { const i = alternative.items.find((i) => i.id === id); if (!i) return; const r = -i.rotation * Math.PI / 180; const dx = x - i.x, dz = z - i.z; updateItem(id, { points: i.points.map((p, n) => n === index ? { x: Math.max(-999, Math.min(999, dx * Math.cos(r) - dz * Math.sin(r))), z: Math.max(-999, Math.min(999, dx * Math.sin(r) + dz * Math.cos(r))) } : p) }, commit); }} view={view} photo={reference?.dataUrl ?? photoVersion?.url}
            photoPoints={(i) => { if (!model) return null; const points = worldPoints(i).map((p) => model.toImage({ x: p.x, y: p.z })); return points.every((p) => p !== null) ? points as { x: number; y: number }[] : null; }} /></div>
          <p className="text-sm text-muted">Drag an item to move it. Select it to change dimensions, height, materials or price. Dimensions below are in {alternative.units === "imperial" ? "feet and inches" : "meters"}.</p>
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-white p-3">
            <Length label="Layout width" value={alternative.width} units={alternative.units} onChange={(width) => change((a) => ({ ...a, width }))} />
            <Length label="Layout depth" value={alternative.depth} units={alternative.units} onChange={(depth) => change((a) => ({ ...a, depth }))} />
            <label>Units<select aria-label="Planning units" className={field} value={alternative.units} onChange={(e) => change((a) => ({ ...a, units: e.target.value as DesignAlternative["units"], items: a.items.map((i) => ({ ...i, unitCost: i.costBasis === "each" ? i.unitCost : null })) }))}><option value="imperial">Feet / inches</option><option value="metric">Meters</option></select></label>
            <label>Boundary source<select aria-label="Boundary source" className={field} value={alternative.boundarySource} onChange={(e) => change((a) => ({ ...a, boundarySource: e.target.value as DesignAlternative["boundarySource"] }))}><option value="estimated">Estimated</option><option value="measured">Measured on site</option></select></label>
          </div>
          <p className="text-xs text-muted">Changing units clears dimension-based unit prices so a price per foot is never treated as a price per meter.</p>
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={onMeasure}>Measure the photo</Button><Button variant="outline" disabled={!model || !!reference} onClick={() => change((a) => ({ ...a, photoAligned: !a.photoAligned }))}>{alternative.photoAligned ? "Unlink photo alignment" : "Use photo coordinate system"}</Button><Button variant="outline" disabled={!selectedVersion || selectedVersion.number === 0} onClick={() => void readPreview()}>Make this preview editable</Button></div>
          <p className="text-xs text-muted">Photo alignment uses the existing calibrated ground plane. Check positions in Photo view; sloping or raised surfaces need separate measurements.</p>
          <label className="block font-semibold">What do you want this space to do?<textarea aria-label="Project brief" className="mt-1 min-h-20 w-full rounded-xl border border-line p-3 font-normal" value={alternative.brief} maxLength={3000} onChange={(e) => change((a) => ({ ...a, brief: e.target.value }))} placeholder="A place to grill and relax with six people..." /></label>
          <div className="flex gap-2"><input aria-label="Change the plan" className={field} placeholder="e.g. make the gazebo two feet wider" value={message} maxLength={2000} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void ask(); } }} /><Button onClick={() => void ask()} disabled={!message.trim()}>{thinking ? "Thinking..." : "Update plan"}</Button></div>
          <p className="text-sm text-muted">{currentPreview ? "A photo preview exists for this revision." : previews.length ? "The photo preview is out of date. Generate a new preview for these changes." : "Generate a photo preview when you are ready."}</p>
          <Button disabled={!alternative.items.length} onClick={async () => { const saved = await save(); if (saved) onPreview(saved.alternatives.find((a) => a.id === saved.activeId)!); }}>Save and preview design</Button>
          {designChecks(alternative).map((check, n) => <p key={n} className="rounded-xl bg-amber-soft p-3 text-sm">{check}</p>)}
        </section>
        <aside className="space-y-4">
          <section className="space-y-3 rounded-2xl border border-line bg-white p-4"><h2 className="font-bold">Photos of your space</h2><p className="text-sm text-muted">Add wide views from different corners. These provide context, not an automatic 3D scan.</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={plan.photos.length >= 4} onClick={() => picker.current?.camera()}>Take another view</Button><Button size="sm" variant="outline" disabled={plan.photos.length >= 4} onClick={() => picker.current?.gallery()}>Add reference photo</Button></div>{plan.photos.map((p) => <div key={p.id} className="rounded-xl border border-line p-2"><img src={p.dataUrl} alt={p.label} className="max-h-32 rounded-lg" /><div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant={p.id === alternative.referenceId ? "primary" : "outline"} onClick={() => change((a) => ({ ...a, referenceId: p.id, photoAligned: false }))}>Use this photo</Button><Button size="sm" variant="outline" onClick={() => setState((h) => history.push(h, { ...h.present, photos: h.present.photos.filter((photo) => photo.id !== p.id), alternatives: h.present.alternatives.map((a) => a.referenceId === p.id ? { ...a, referenceId: null, photoAligned: false, revision: revisionCounter.current++ } : a) }))}>Remove reference</Button></div></div>)}{reference && <Button size="sm" variant="outline" onClick={() => change((a) => ({ ...a, referenceId: null, photoAligned: false }))}>Use original project photo</Button>}</section>
          <section className="rounded-2xl border border-line bg-white p-4"><h2 className="font-bold">Add to your plan</h2><input aria-label="Search planning items" className={`${field} my-2`} placeholder="Kitchen, gazebo, wall, custom..." value={search} onChange={(e) => setSearch(e.target.value)} /><div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto">{CATALOG.filter((c) => `${c.label} ${c.noun}`.toLowerCase().includes(search.toLowerCase())).map((c) => <Button size="sm" variant="outline" key={c.id} onClick={() => add(c.id)}>{c.label}</Button>)}</div></section>
          <section className="rounded-2xl border border-line bg-white p-4"><h2 className="mb-2 font-bold">Your items</h2>{!alternative.items.length && <p className="text-sm text-muted">Add an item to get started. You can combine any project types.</p>}<div className="flex flex-wrap gap-2">{alternative.items.map((i, n) => <Button key={i.id} size="sm" variant={selected === i.id ? "primary" : "outline"} onClick={() => setSelected(i.id)}>{n + 1}. {i.name}{i.locked ? " 🔒" : ""}</Button>)}</div></section>
          {item && <section className="rounded-2xl border border-line bg-white p-4" key={item.id}>
            <h2 className="mb-3 text-lg font-bold">Edit {item.name}</h2>
            <label className="mb-3 flex items-center gap-2"><input type="checkbox" checked={item.locked} onChange={(e) => updateItem(item.id, { locked: e.target.checked })} />Lock this item</label>
            <fieldset disabled={item.locked} className="space-y-3">
              <label className="block">Name<input aria-label="Item name" className={field} value={item.name} maxLength={80} onChange={(e) => { if (e.target.value.trim()) updateItem(item.id, { name: e.target.value }); }} /></label>
              <label className="block">Action<select aria-label="Item action" className={field} value={item.operation} onChange={(e) => updateItem(item.id, { operation: e.target.value as DesignItem["operation"] })}>{["add", "change", "remove", "existing"].map((op) => <option key={op}>{op}</option>)}</select></label>
              <div className="grid grid-cols-2 gap-2">{([['width', 'Width'], ['depth', 'Depth'], ['height', 'Height / water depth'], ['x', 'Position across'], ['z', 'Position back'], ['elevation', 'Base elevation'], ['clearance', 'Clearance']] as const).map(([k, label]) => <Length key={k} label={label} value={item[k]} units={alternative.units} allowZero={!["width", "depth"].includes(k)} onChange={(v) => updateItem(item.id, { [k]: v })} />)}</div>
              <label className="block">Rotation<input aria-label="Item rotation" type="range" min="-180" max="180" value={item.rotation} onChange={(e) => updateItem(item.id, { rotation: Number(e.target.value) })} className="w-full" /></label>
              <label className="block">Dimension source<select aria-label="Dimension source" className={field} value={item.source} onChange={(e) => updateItem(item.id, { source: e.target.value as DesignItem["source"] })}><option value="desired">Desired size</option><option value="measured">Measured on site</option><option value="estimated">Estimated</option></select></label>
              {getItem(item.type).options.filter((o) => o.id !== "height").map((o) => o.type === "choice" ? <label key={o.id} className="block">{o.label}<select aria-label={`Design option: ${o.label}`} className={field} value={String(item.options[o.id] ?? o.default)} onChange={(e) => updateItem(item.id, { options: { ...item.options, [o.id]: e.target.value } })}>{o.choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label> : <label key={o.id} className="flex gap-2"><input aria-label={`Design option: ${o.label}`} type="checkbox" checked={(item.options[o.id] ?? o.default) === true} onChange={(e) => updateItem(item.id, { options: { ...item.options, [o.id]: e.target.checked } })} />{o.label}</label>)}
              <label className="block">Material<input aria-label="Item material" className={field} value={item.material} maxLength={300} onChange={(e) => updateItem(item.id, { material: e.target.value })} placeholder="Cedar, dark stain..." /></label>
              <label className="flex gap-2 text-sm"><input type="checkbox" checked={moveGroup} onChange={(e) => setMoveGroup(e.target.checked)} />Move grouped items together</label>
              <label className="block">Group<input aria-label="Item group" className={field} value={item.group} maxLength={80} onChange={(e) => updateItem(item.id, { group: e.target.value })} placeholder="Patio and cover" /></label>
              {item.shape === "path" && <label className="flex gap-2"><input type="checkbox" checked={item.curved} onChange={(e) => updateItem(item.id, { curved: e.target.checked })} />Round the corners</label>}
              {item.shape === "path" && <RoutePoints item={item} units={alternative.units} onChange={(points) => updateItem(item.id, { points })} />}
              {item.shape === "path" && <label className="flex gap-2"><input type="checkbox" checked={item.closed} onChange={(e) => updateItem(item.id, { closed: e.target.checked })} />Close the loop</label>}
              <label className="block">Notes<textarea aria-label="Item notes" className="w-full rounded-xl border border-line p-2" value={item.notes} maxLength={1000} onChange={(e) => updateItem(item.id, { notes: e.target.value })} /></label>
              <details><summary className="cursor-pointer font-semibold">Quantity and cost</summary><div className="mt-2 space-y-2">
                <label className="block">Price basis<select aria-label="Price basis" className={field} value={item.costBasis} onChange={(e) => updateItem(item.id, { costBasis: e.target.value as DesignItem["costBasis"], unitCost: null })}>{["each", "length", "area", "volume"].map((b) => <option key={b}>{b}</option>)}</select></label>
                <p className="text-sm">Pricing quantity: {designQuantity(item, alternative.units).purchase.toFixed(2)} {designQuantity(item, alternative.units).unit}</p>
                <label className="block">Unit price ({alternative.currency})<input aria-label="Unit price" type="number" min="0" max="10000000" className={field} value={item.unitCost ?? ""} onChange={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v === null || Number.isFinite(v) && v >= 0 && v <= 10000000) updateItem(item.id, { unitCost: v }); }} /></label>
                <label className="block">Labor allowance<input aria-label="Labor allowance" type="number" min="0" max="10000000" className={field} value={item.laborCost} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0 && v <= 10000000) updateItem(item.id, { laborCost: v }); }} /></label>
                <label className="block">Waste allowance (%)<input aria-label="Waste allowance" type="number" min="0" max="50" className={field} value={item.waste} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0 && v <= 50) updateItem(item.id, { waste: v }); }} /></label>
              </div></details>
              <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={alternative.items.length >= 60} onClick={() => { const copy = { ...structuredClone(item), id: uid(), name: `${item.name.slice(0, 65)} (copy)`, x: item.x + 0.5, z: item.z + 0.5 }; change((a) => ({ ...a, items: [...a.items, copy] })); setSelected(copy.id); }}>Duplicate item</Button><Button size="sm" variant="outline" onClick={() => { change((a) => ({ ...a, items: a.items.filter((i) => i.id !== item.id) })); setSelected(null); }}>Delete item</Button></div>
            </fieldset>
          </section>}
          <section className="space-y-3 rounded-2xl border border-line bg-white p-4"><h2 className="font-bold">Budget assumptions</h2><p>{alternative.currency} {costs.reduce((s, q) => s + (q.cost ?? 0), 0).toFixed(2)} known-price subtotal</p><p className="text-sm text-muted">{costs.filter((q) => q.cost === null).length} items need prices. Taxes, delivery and unlisted work excluded.</p><label className="block">Currency<select aria-label="Budget currency" className={field} value={alternative.currency} onChange={(e) => change((a) => ({ ...a, currency: e.target.value as DesignAlternative["currency"], items: a.items.map((i) => ({ ...i, unitCost: null, laborCost: 0 })) }))}>{["USD", "CAD", "GBP", "EUR", "AUD"].map((c) => <option key={c}>{c}</option>)}</select></label><input aria-label="Price location" className={field} placeholder="Price location" value={alternative.location} maxLength={120} onChange={(e) => change((a) => ({ ...a, location: e.target.value }))} /><input aria-label="Price date" type="date" className={field} value={alternative.priceDate} onChange={(e) => change((a) => ({ ...a, priceDate: e.target.value }))} /></section>
          <section className="space-y-3 rounded-2xl border border-line bg-white p-4"><h2 className="font-bold">Prepare for the project</h2>{DESIGN_STEPS.map((step) => <label key={step.id} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={alternative.completedSteps.includes(step.id)} onChange={(e) => change((a) => ({ ...a, completedSteps: e.target.checked ? [...a.completedSteps, step.id] : a.completedSteps.filter((s) => s !== step.id) }))} /><span><b>{step.title}</b><br />{step.text}</span></label>)}<textarea aria-label="Unresolved questions" className="min-h-24 w-full rounded-xl border border-line p-2" placeholder="Unresolved questions, contractor notes..." value={alternative.notes} maxLength={4000} onChange={(e) => change((a) => ({ ...a, notes: e.target.value }))} /></section>
        </aside>
      </div>
    </fieldset>
  </main>;
}

function Length({ label, value, units, onChange, allowZero = false }: { label: string; value: number; units: "imperial" | "metric"; onChange: (v: number) => void; allowZero?: boolean }) {
  const [text, setText] = useState(formatLength(value, units));
  const [error, setError] = useState(false);
  useEffect(() => setText(formatLength(value, units)), [value, units]);
  return <label className="block text-sm">{label}<input aria-label={label} className="h-10 w-full rounded-xl border border-line px-2 text-base" value={text} aria-invalid={error} onChange={(e) => setText(e.target.value)} onBlur={() => { const signed = label.startsWith("Position") || label === "Base elevation"; const negative = signed && text.trim().startsWith("-"); const raw = negative ? text.trim().slice(1) : text; const parsed = allowZero && /^0\s*(ft|m|in)?$/.test(raw.trim()) ? 0 : parseLength(raw, units); const v = parsed === null ? null : parsed * (negative ? -1 : 1); const valid = v !== null && v <= (label.includes("Height") ? 100 : label === "Clearance" ? 30 : 1000) && v >= (signed ? -1000 : allowZero ? 0 : 0.01); setError(!valid); if (valid && text !== formatLength(value, units) && Math.abs(v! - value) > 0.000001) onChange(v!); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />{error && <span className="text-xs text-red-700">Enter a valid size in {units === "imperial" ? "ft or in" : "m"}.</span>}</label>;
}

function RoutePoints({ item, units, onChange }: { item: DesignItem; units: "imperial" | "metric"; onChange: (points: DesignItem["points"]) => void }) {
  const factor = units === "imperial" ? 1 / 0.3048 : 1;
  const format = () => item.points.map((p) => `${(p.x * factor).toFixed(2)}, ${(p.z * factor).toFixed(2)}`).join("\n");
  const [text, setText] = useState(format);
  const [error, setError] = useState(false);
  useEffect(() => setText(format()), [item.points, units]);
  return <label className="block text-sm">Route points relative to center ({units === "imperial" ? "ft" : "m"}, across, back)<textarea aria-label="Route points" value={text} className="min-h-28 w-full rounded-xl border border-line p-2 font-mono" onChange={(e) => setText(e.target.value)} onBlur={() => { const points = text.trim().split("\n").map((line) => { const cells = line.split(","); const parts = cells.length === 2 && cells.every((c) => c.trim()) ? cells.map(Number) : [NaN, NaN]; return { x: parts[0]! / factor, z: parts[1]! / factor }; }); const parsed = designItemSchema.safeParse({ ...item, points }); setError(!parsed.success); if (parsed.success) onChange(parsed.data.points); }} />{error && <span className="text-red-700">Enter at least two coordinate pairs, one per line.</span>}</label>;
}
