"use client";

import { getItem, spaceTitle, type Calibration, type Drawing, type EditRequest, type Point, type Reference, type SpaceType } from "@architech/core";
import { referenceProblem } from "@architech/measure";
import { BeforeAfterSlider, Button, Segmented, Switch, cn } from "@architech/ui";
import { ArrowLeft, Check, CircleAlert, Cloud, Download, Loader2, Pencil, Ruler, Share2, Smartphone, Sparkles, Trash2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { addMeasurement, clearFloorRect, confirmReference, guessKind, removeReference, setFloorRect } from "@/lib/calibration";
import { removeLastPoint } from "@/lib/drawing-tools";
import { shortcutFor, type Shortcut } from "@/lib/keyboard";
import {
  buildRequest,
  canRedoFree,
  chipsFor,
  clearPendingJob,
  history,
  loadDraftDrawings,
  loadPendingJob,
  previousVersionId,
  saveDraftDrawings,
  savePendingJob,
  type History,
} from "@/lib/editor-logic";
import { fileNameFor, renderMeasured, saveImage, shareImage } from "@/lib/export";
import { overlaysFor, scaleOf } from "@/lib/measure-view";
import { applyJob, loadProject, startEdit, updateProject, waitForJob, type ProjectPatch } from "@/lib/projects";
import type { CJob, CProject, Suggestion } from "@/lib/types";
import { AppHeader, PageShell } from "../AppHeader";
import { Logo } from "../Logo";
import { useSession, useToast } from "../Providers";
import { AddSomethingPanel } from "./AddSomethingPanel";
import { AssistantPanel } from "./AssistantPanel";
import { CalibrateStage, type CalTool } from "./CalibrateStage";
import { GeneratingOverlay } from "./Generating";
import { GettingPanel } from "./GettingPanel";
import { MeasureOverlay } from "./MeasureOverlay";
import { OutOfCreditsSheet } from "./OutOfCreditsSheet";
import { RoomSizePanel, type PendingMeasure } from "./RoomSizePanel";
import { VersionsStrip } from "./VersionsStrip";
import { PlannerScreen } from "./PlannerScreen";
import { drawingsForDesign } from "@/lib/planning";

const DrawCanvas = dynamic(() => import("./DrawCanvas"), {
  ssr: false,
  loading: () => <div className="grid aspect-[4/3] w-full place-items-center rounded-2xl bg-sand text-muted">Loading the drawing tools...</div>,
});

type Mode = "chat" | "draw" | "measure";
type View = "compare" | "before" | "after";

const EMPTY_REQUEST: EditRequest = { message: "", drawings: [], keep: [], fromOriginal: false };

function friendly(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === "out_of_credits") return "You're out of free edits.";
    if (e.code === "rate_limited") return "Slow down a little - try again in a minute.";
    if (e.code === "ai_not_configured") return "The AI isn't set up on the server yet.";
    if (e.code === "retry_used") return "You already used the free redo for this one.";
    return e.message;
  }
  return "Something went wrong. Please try again.";
}

function touchHint(text: string, touch: boolean) {
  if (!touch) return text;
  return text
    .replace(/Double-click to finish\.?/g, "Tap the last dot again to finish.")
    .replace(/\bClick\b/g, "Tap")
    .replace(/\bclick\b/g, "tap");
}

export function EditorScreen({ id }: { id: string }) {
  const router = useRouter();
  const { me, loading: sessionLoading, refresh } = useSession();
  // Session refreshes (e.g. new credit counts) replace `me`; only a different user should reload the project.
  const userId = me?.user?.id ?? null;
  const toast = useToast();

  const [project, setProjectState] = useState<CProject | null>(null);
  const projectRef = useRef<CProject | null>(null);
  const setProject = useCallback((p: CProject) => {
    projectRef.current = p;
    setProjectState(p);
  }, []);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("chat");
  const [view, setView] = useState<View>("compare");
  const [showMeasure, setShowMeasure] = useState(false);
  const [message, setMessage] = useState("");

  const [draw, setDraw] = useState<History<Drawing[]>>(() => history.init([]));
  const [selDrawing, setSelDrawing] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [brush, setBrush] = useState({ size: 0.04, erase: false });
  const [zoom, setZoom] = useState(1);

  const [job, setJob] = useState<CJob | null>(null);
  const [jobStart, setJobStart] = useState(0);
  const [starting, setStarting] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const [calHist, setCalHist] = useState<History<Calibration> | null>(null);
  const [calTool, setCalTool] = useState<CalTool>("none");
  const [pending, setPending] = useState<PendingMeasure | null>(null);
  const [savingCal, setSavingCal] = useState(false);

  const [editingTitle, setEditingTitle] = useState(false);
  const [complaintOpen, setComplaintOpen] = useState(false);
  const [complaint, setComplaint] = useState("");
  const [outOfCredits, setOutOfCredits] = useState(false);
  const [touch, setTouch] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("plan") === "1") setPlanOpen(true);
    try { const idea = sessionStorage.getItem(`homeredo:idea:${id}`); if (idea) { setMessage(idea); sessionStorage.removeItem(`homeredo:idea:${id}`); } } catch { /* optional */ }
  }, [id]);

  useEffect(() => setTouch(window.matchMedia("(pointer: coarse)").matches), []);

  // ---- Loading ----

  useEffect(() => {
    if (!sessionLoading && !userId) router.replace(`/sign-in?next=${encodeURIComponent(`/p/${id}`)}`);
  }, [sessionLoading, userId, id, router]);

  const follow = useCallback(
    async (j: CJob, request: EditRequest) => {
      abort.current?.abort();
      const ac = new AbortController();
      abort.current = ac;
      setJob(j);
      setJobStart(Date.parse(j.createdAt) || Date.now());
      try {
        const final = await waitFor(j, ac.signal, setJob);
        const p = projectRef.current;
        if (!p) return;
        if (final.status === "succeeded") {
          if (p.where === "device" && p.versions.some((v) => v.jobId === final.id)) return;
          const next = await applyJob(p, final, request);
          setProject(next);
          const newest = final.versionId && next.versions.some((v) => v.id === final.versionId) ? final.versionId : [...next.versions].sort((a, b) => b.number - a.number)[0]?.id;
          const snapshot = request.design;
          const stale = snapshot && !next.planning?.alternatives.some((a) => a.id === snapshot.id && a.revision === snapshot.revision);
          setSelectedId(stale ? next.coverVersionId : newest ?? null);
          if (stale) toast("Saved an earlier plan preview in history. Your newer design stays selected.", "info");
          setDraw(history.init([]));
          setSelDrawing(null);
          setDraftId(null);
          setActiveItem(null);
          setMode("chat");
          setView("compare");
          if (final.verified === false) toast("Done - but check it. Something may have changed. You weren't charged.", "info");
        } else {
          toast(final.error ?? "That edit didn't work. You weren't charged.", "error");
        }
      } catch (e) {
        if ((e as DOMException).name === "AbortError") return;
        toast(e instanceof ApiError && e.status === 404 ? "That edit expired. Please try again." : friendly(e), "error");
      } finally {
        if (!ac.signal.aborted) {
          setJob(null);
          clearPendingJob(id);
          void refresh();
        }
      }
    },
    [id, refresh, setProject, toast],
  );

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setStatus("loading");
    loadProject(id)
      .then(async (p) => {
        if (!alive) return;
        if (!p) return setStatus("missing");
        setProject(p);
        setSelectedId(p.coverVersionId ?? [...p.versions].sort((a, b) => b.number - a.number)[0]?.id ?? null);
        const saved = loadDraftDrawings(id);
        if (saved.length) setDraw(history.init(saved));
        setStatus("ready");
        const active = p.where === "server" ? p.activeJobs?.[0] : null;
        if (active) return void follow(active, EMPTY_REQUEST);
        const local = p.where === "device" ? loadPendingJob(id) : null;
        if (local) {
          if (p.versions.some((v) => v.jobId === local.jobId)) return clearPendingJob(id);
          try {
            const { job: j } = await api.getJob(local.jobId);
            if (alive) void follow(j, local.request);
          } catch {
            clearPendingJob(id);
          }
        }
      })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 401) router.replace(`/sign-in?next=${encodeURIComponent(`/p/${id}`)}`);
        else setStatus("error");
      });
    return () => {
      alive = false;
      abort.current?.abort();
    };
  }, [id, userId, follow, router, setProject]);

  useEffect(() => {
    if (status === "ready") saveDraftDrawings(id, draw.present);
  }, [id, draw.present, status]);

  const [peek, setPeek] = useState(false);
  const onShortcut = useRef<(s: Shortcut) => void>(() => {});
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const s = shortcutFor(e, e.target as Element | null);
      if (!s || document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      if (!e.repeat) onShortcut.current(s);
    };
    const up = (e: KeyboardEvent) => e.key === " " && setPeek(false);
    const blur = () => setPeek(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // ---- Derived ----

  const busy = starting || !!job;
  const versions = useMemo(() => [...(project?.versions ?? [])].sort((a, b) => a.number - b.number), [project?.versions]);
  const original = versions[0] ?? null;
  const selected = versions.find((v) => v.id === selectedId) ?? versions.at(-1) ?? null;
  const aspect = original && original.height ? original.width / original.height : 4 / 3;
  const calibration: Calibration | null = mode === "measure" && calHist ? calHist.present : (project?.calibration ?? null);
  const units = calibration?.units ?? me?.units ?? "imperial";
  const { model, status: scaleStatus } = useMemo(() => scaleOf(calibration), [calibration]);
  const shownDrawings = mode === "draw" ? draw.present : (selected?.request?.drawings ?? []);
  const sizeOverlays = useMemo(() => (model ? overlaysFor(shownDrawings, model, units) : []), [model, shownDrawings, units]);
  const overlays = showMeasure ? sizeOverlays : [];
  const chips = project ? chipsFor(project, selected?.id ?? null) : [];
  const space = project ? spaceTitle(project.spaceType).toLowerCase() : "space";

  // ---- Actions ----

  const run = async (request: EditRequest, baseId?: string) => {
    const p = projectRef.current;
    if (!p || busy) return;
    if (me?.credits === 0) return setOutOfCredits(true);
    setStarting(true);
    try {
      const j = await startEdit(p, baseId ?? selected?.id ?? null, request);
      if (p.where === "device") savePendingJob(p.id, { jobId: j.id, request });
      setMessage("");
      setStarting(false);
      void refresh();
      await follow(j, request);
    } catch (e) {
      if (e instanceof ApiError && e.code === "out_of_credits") {
        setOutOfCredits(true);
        void refresh();
      } else toast(friendly(e), "error");
    } finally {
      setStarting(false);
    }
  };

  const send = (text = message) => {
    if (!project) return;
    const r = buildRequest({ message: text, drawings: draw.present, keep: project.keep });
    if (!r.ok) return toast(r.error, "error");
    void run(r.request);
  };

  const makeItReal = () => {
    if (!project) return;
    const r = buildRequest({ message, drawings: draw.present, keep: project.keep });
    if (!r.ok) return toast(draw.present.length ? "Finish your drawing first (tap Done drawing)." : "Pick something to add and draw it on the photo.", "error");
    void run(r.request);
  };

  const onChip = (s: Suggestion) => send(s.prompt);

  const patch = async (next: ProjectPatch) => {
    const p = projectRef.current;
    if (!p) return;
    setProject({ ...p, ...next });
    try {
      const saved = await updateProject(p, next);
      setProject({ ...projectRef.current!, ...next, updatedAt: saved.updatedAt });
    } catch (e) {
      setProject(p);
      toast(friendly(e), "error");
    }
  };

  const toggleKeep = (kid: string) => {
    const p = projectRef.current;
    if (p) void patch({ keep: p.keep.map((k) => (k.id === kid ? { ...k, keep: !k.keep } : k)) });
  };

  const selectVersion = (vid: string) => {
    setSelectedId(vid);
    setView("compare");
    void patch({ coverVersionId: vid });
  };

  const exportBlob = async (measured: boolean) => {
    if (!selected) throw new Error("Nothing to save");
    if (measured) return renderMeasured(selected.url, sizeOverlays);
    return api.fetchBlob(selected.url);
  };

  const [downloadMenu, setDownloadMenu] = useState(false);
  const download = async (measured: boolean) => {
    setDownloadMenu(false);
    try {
      await saveImage(await exportBlob(measured), fileNameFor(project!.title, selected!.label, { measured }));
    } catch (e) {
      toast(friendly(e), "error");
    }
  };

  const share = async () => {
    const measured = overlays.length > 0;
    try {
      const how = await shareImage(await exportBlob(measured), fileNameFor(project!.title, selected!.label, { measured }), project!.title);
      if (how === "downloaded") toast("Saved to your downloads.", "success");
    } catch (e) {
      toast(friendly(e), "error");
    }
  };

  const redoFree = async () => {
    const v = selected;
    const p = projectRef.current;
    if (!v?.jobId || !p || busy) return;
    setStarting(true);
    try {
      const { job: j } = await api.retryJob(v.jobId, complaint.trim() || undefined);
      const request = v.request ?? EMPTY_REQUEST;
      if (p.where === "device") savePendingJob(p.id, { jobId: j.id, request });
      setComplaintOpen(false);
      setComplaint("");
      setStarting(false);
      await follow(j, request);
    } catch (e) {
      toast(friendly(e), "error");
    } finally {
      setStarting(false);
    }
  };

  // ---- Drawing ----

  const onDrawChange = (next: Drawing[], commit: boolean) => setDraw((h) => (commit ? history.push(h, next) : history.set(h, next)));
  const updateDrawing = (d: Drawing, commit: boolean) => onDrawChange(draw.present.map((x) => (x.id === d.id ? d : x)), commit);
  const deleteDrawing = (did: string) => {
    onDrawChange(draw.present.filter((d) => d.id !== did), true);
    if (selDrawing === did) setSelDrawing(null);
    if (draftId === did) setDraftId(null);
  };
  const undoDraw = () => {
    const next = history.undo(draw);
    setDraw(next);
    if (draftId && !next.present.some((d) => d.id === draftId)) setDraftId(null);
    if (selDrawing && !next.present.some((d) => d.id === selDrawing)) setSelDrawing(null);
  };
  const undoDot = () => {
    const d = draw.present.find((x) => x.id === draftId);
    if (d && d.points.length > 1) updateDrawing(removeLastPoint(d), true);
  };

  const photoRef = useRef<HTMLDivElement>(null);
  /** On phones the tools sit below the photo; bring the photo back up so you can tap on it. */
  const showPhoto = () =>
    requestAnimationFrame(() => {
      const el = photoRef.current;
      if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });

  const enterDraw = (item: string | null = null) => {
    setMode("draw");
    setView("after");
    setActiveItem(item);
    showPhoto();
  };
  const pickItem = (item: string | null) => {
    setActiveItem(item);
    if (item) showPhoto();
  };

  // ---- Measuring ----

  const enterMeasure = () => {
    const p = projectRef.current;
    if (!p || !original) return;
    const cal: Calibration = p.calibration ?? { imageWidth: original.width, imageHeight: original.height, references: [], units };
    setCalHist(history.init(cal));
    setCalTool("none");
    setPending(null);
    setMode("measure");
    showPhoto();
  };
  const pushCal = (next: Calibration) => setCalHist((h) => (h ? history.push(h, next) : h));

  const saveMeasure = async () => {
    if (!calHist) return;
    setSavingCal(true);
    await patch({ calibration: calHist.present });
    setSavingCal(false);
    setMode("chat");
    setCalTool("none");
    setPending(null);
    toast(scaleOf(calHist.present).status === "user" ? "Saved. Sizes are now to scale." : "Saved.", "success");
  };

  const onSavePending = (lengthM: number, kind: Reference["kind"], label: string) => {
    if (!calHist || !pending) return;
    let cal = calHist.present;
    if (pending.ref) cal = removeReference(cal, pending.ref.id);
    pushCal(addMeasurement(cal, pending.a, pending.b, lengthM, kind, label));
    setPending(null);
  };

  const onUnits = (u: "imperial" | "metric") => {
    if (calHist) pushCal({ ...calHist.present, units: u });
    void api
      .setUnits(u)
      .then(() => refresh())
      .catch(() => {});
  };

  const onRoomSize = (size: NonNullable<Calibration["roomSize"]>) => {
    if (!calHist) return;
    const cal = calHist.present;
    const fr = cal.floorRect && size.lengthM && size.widthM ? { ...cal.floorRect, widthM: size.lengthM, depthM: size.widthM } : cal.floorRect;
    pushCal({ ...cal, roomSize: size, ...(fr ? { floorRect: fr } : {}) });
  };

  const undoVersion = () => {
    const prev = project && selected ? previousVersionId(project, selected.id) : null;
    if (prev) selectVersion(prev);
  };

  onShortcut.current = (s) => {
    if (s === "peek") return setPeek(mode !== "measure" && !!selected && selected.number > 0);
    if (mode === "measure") return setCalHist((h) => (h ? (s === "undo" ? history.undo(h) : history.redo(h)) : h));
    if (busy) return;
    if (mode === "draw") return s === "undo" ? undoDraw() : setDraw((h) => history.redo(h));
    if (s === "undo") undoVersion();
  };

  // ---- Render ----

  if (status === "missing" || status === "error") {
    return (
      <PageShell>
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <p className="text-2xl font-extrabold">{status === "missing" ? "We can't find that project." : "Couldn't open that project."}</p>
          <p className="mt-2 text-muted">{status === "missing" ? "It may have been deleted, or it's saved on a different device." : "Check your internet connection and try again."}</p>
          <Link href="/projects" className="mt-6 inline-flex h-12 items-center rounded-2xl bg-forest px-6 font-bold text-white">
            Go to my projects
          </Link>
        </main>
      </PageShell>
    );
  }

  if (!project || !selected || !original) {
    return (
      <PageShell>
        <div className="grid min-h-[60vh] place-items-center text-muted">
          <Loader2 className="size-8 animate-spin" aria-label="Loading" />
        </div>
      </PageShell>
    );
  }

  const header = (
    <AppHeader
      left={
        <>
          <Link href="/projects" aria-label="Back to my projects" className="grid size-10 place-items-center rounded-full hover:bg-sand md:hidden">
            <ArrowLeft className="size-6" />
          </Link>
          <p className="min-w-0 flex-1 truncate text-lg font-extrabold md:hidden">{project.title}</p>
          <Link href="/" aria-label="HomeRedo home" className="hidden md:block">
            <Logo />
          </Link>
        </>
      }
    />
  );

  const drawnHere = draw.present.find((d) => d.id === selDrawing) ?? null;
  const hint =
    mode !== "draw"
      ? null
      : draftId
        ? touch
          ? "Tap the last dot again to finish."
          : "Double-click to finish."
        : activeItem
          ? touchHint(getItem(activeItem).hint, touch)
          : drawnHere?.kind === "brush"
            ? "Paint over what you want to change."
            : drawnHere && drawnHere.kind === "area"
              ? touchHint("Drag the corners to fit. The rest of the room stays the same.", touch)
              : drawnHere
                ? "Drag the dots to adjust it, or press Make it real."
                : draw.present.length === 0
                  ? "Pick something to add, then tap the photo where it goes."
                  : "Add something else, or press Make it real.";

  const showSwitches = mode !== "measure" && (versions.length > 1 || draw.present.length > 0);
  const canCompare = selected.number > 0;
  const effectiveView: View = mode !== "chat" ? "after" : !canCompare ? "after" : view;
  const busyStage = starting ? "understanding" : (job?.stage ?? "understanding");

  const photo = (
    <div ref={photoRef} className="relative scroll-mt-20">
      {mode === "draw" ? (
        <div className="relative">
          <DrawCanvas
            imageUrl={selected.url}
            aspect={aspect}
            drawings={draw.present}
            onChange={onDrawChange}
            selectedId={selDrawing}
            onSelect={setSelDrawing}
            activeItem={activeItem}
            onPlaced={() => setActiveItem(null)}
            draftId={draftId}
            onDraft={setDraftId}
            brush={brush}
            model={model}
            zoom={zoom}
          />
          {overlays.length > 0 && zoom === 1 && <MeasureOverlay overlays={overlays} aspect={aspect} />}
        </div>
      ) : mode === "measure" && calHist ? (
        <CalibrateStage
          imageUrl={selected.url}
          aspect={aspect}
          calibration={calHist.present}
          tool={calTool}
          pending={pending}
          onMeasured={(a: Point, b: Point) => {
            setCalTool("none");
            setPending({ a, b, kind: guessKind(a, b, aspect) });
          }}
          onFloorCorners={(corners) => {
            const s = calHist.present.roomSize;
            setCalTool("none");
            if (s?.lengthM && s.widthM) pushCal(setFloorRect(calHist.present, corners, s.lengthM, s.widthM));
          }}
          onConfirm={(r) => pushCal(confirmReference(calHist.present, r.id))}
          onFix={(r) => setPending({ a: r.a, b: r.b, kind: r.kind, ref: r })}
          onEdit={(r) => setPending({ a: r.a, b: r.b, kind: r.kind, ref: r })}
        />
      ) : effectiveView === "compare" ? (
        <BeforeAfterSlider before={original.url} after={selected.url} aspect={aspect} overlay={overlays.length ? <MeasureOverlay overlays={overlays} aspect={aspect} /> : undefined} />
      ) : (
        <div className="relative w-full overflow-hidden rounded-2xl bg-sand" style={{ aspectRatio: String(aspect) }}>
          <img src={effectiveView === "before" ? original.url : selected.url} alt={effectiveView === "before" ? "Before" : selected.label} className="absolute inset-0 size-full object-cover" draggable={false} />
          {effectiveView !== "before" && overlays.length > 0 && <MeasureOverlay overlays={overlays} aspect={aspect} />}
          {selected.number === 0 && project.messages.length === 0 && (
            <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-forest px-3 py-1.5 text-sm font-bold text-white shadow">
              <Check className="size-4" /> {spaceTitle(project.spaceType)} detected
            </span>
          )}
        </div>
      )}
      {peek && (
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-2xl bg-sand">
          <img src={original.url} alt="Original photo" className="size-full object-cover" draggable={false} />
          <span className="absolute left-3 top-3 rounded-full bg-ink/80 px-3 py-1.5 text-sm font-bold text-white">Original</span>
        </div>
      )}
      {hint && !peek && (
        <p className="pointer-events-none absolute left-1/2 top-3 z-10 w-max max-w-[92%] -translate-x-1/2 rounded-full bg-white/95 px-4 py-2 text-center text-sm font-bold shadow-lg md:text-[15px]">{hint}</p>
      )}
      {busy && <GeneratingOverlay stage={busyStage} spaceName={space} startedAt={jobStart || Date.now()} />}
    </div>
  );

  const toolbar =
    mode === "draw" ? (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={undoDraw} disabled={!history.canUndo(draw) || busy} title="Undo (Ctrl+Z)">
            <Undo2 className="size-4" /> Undo
          </Button>
          <Button variant="outline" onClick={() => selDrawing && deleteDrawing(selDrawing)} disabled={!selDrawing || busy}>
            <Trash2 className="size-4" /> Delete
          </Button>
          <Button variant="outline" onClick={() => setZoom((z) => (z > 1 ? 1 : 2))} aria-pressed={zoom > 1}>
            {zoom > 1 ? <ZoomOut className="size-4" /> : <ZoomIn className="size-4" />} Zoom
          </Button>
          <Button variant="ghost" onClick={() => setMode("chat")} disabled={busy} className="ml-auto">
            Back to chat
          </Button>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Anything to add? (optional) e.g. 6 ft cedar privacy fence"
            aria-label="Describe it"
            disabled={busy}
            className="h-14 min-w-0 flex-1 rounded-2xl border border-line bg-white px-4 text-[16px] outline-none focus:border-forest/60"
          />
          <Button size="lg" onClick={makeItReal} disabled={busy || draw.present.length === 0} className="sm:min-w-56">
            <Sparkles className="size-5" /> Make it real
          </Button>
        </div>
      </div>
    ) : mode === "measure" ? (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => setCalHist((h) => (h ? history.undo(h) : h))} disabled={!calHist || !history.canUndo(calHist)} title="Undo (Ctrl+Z)">
          <Undo2 className="size-4" /> Undo
        </Button>
        <Button variant={calTool === "measure" ? "primary" : "outline"} onClick={() => setCalTool((t) => (t === "measure" ? "none" : "measure"))}>
          <Ruler className="size-4" /> Measure something
        </Button>
        <Button variant="ghost" onClick={() => setMode("chat")}>
          Cancel
        </Button>
        <Button size="lg" className="ml-auto" onClick={() => void saveMeasure()} disabled={savingCal}>
          <Check className="size-5" /> Done
        </Button>
      </div>
    ) : (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {versions.length > 1 ? <VersionsStrip versions={versions} selectedId={selected.id} onSelect={selectVersion} disabled={busy} /> : <div className="flex-1" />}
        <div className="flex shrink-0 gap-2 sm:ml-auto">
          <Button variant="outline" onClick={undoVersion} disabled={busy || selected.number === 0} title="Undo (Ctrl+Z)">
            <Undo2 className="size-4" /> Undo
          </Button>
          <div className="relative">
            <Button
              variant="outline"
              onClick={() => (sizeOverlays.length ? setDownloadMenu((o) => !o) : void download(false))}
              aria-haspopup={sizeOverlays.length ? "menu" : undefined}
              aria-expanded={sizeOverlays.length ? downloadMenu : undefined}
            >
              <Download className="size-4" /> Download
            </Button>
            {downloadMenu && sizeOverlays.length > 0 && (
              <>
                <button type="button" aria-label="Close" tabIndex={-1} className="fixed inset-0 z-30 cursor-default" onClick={() => setDownloadMenu(false)} />
                <div role="menu" aria-label="Download" onKeyDown={(e) => e.key === "Escape" && setDownloadMenu(false)} className="absolute bottom-full right-0 z-40 mb-2 flex w-56 flex-col rounded-2xl border border-line bg-white p-1.5 shadow-xl">
                  <button type="button" role="menuitem" autoFocus onClick={() => void download(true)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-left font-bold hover:bg-sand">
                    <Ruler className="size-4" /> With measurements
                  </button>
                  <button type="button" role="menuitem" onClick={() => void download(false)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-left font-bold hover:bg-sand">
                    <Download className="size-4" /> Clean photo
                  </button>
                </div>
              </>
            )}
          </div>
          <Button variant="outline" onClick={() => void share()}>
            <Share2 className="size-4" /> Share
          </Button>
        </div>
      </div>
    );

  if (planOpen) return <PageShell header={header}><PlannerScreen project={project} selectedVersion={selected}
    onClose={() => setPlanOpen(false)}
    onMeasure={() => { setPlanOpen(false); enterMeasure(); }}
    onSave={async (planning, expectedPlanningRevision) => { const current = projectRef.current!; const next = await updateProject(current, { planning, expectedPlanningRevision }); setProject(next); }}
    onPreview={(design) => {
      const current = projectRef.current!;
      const marks = design.referenceId ? [] : drawingsForDesign(design, current);
      const changed = design.items.filter((i) => i.operation !== "existing");
      setPlanOpen(false); setMode("chat");
      void run({ message: `Render the saved design "${design.name}". Update matching existing objects instead of duplicating them. Follow the complete design specification.`, drawings: marks.length === changed.length ? marks : [], keep: current.keep, fromOriginal: false, design, contextPhotos: current.planning?.photos.filter((p) => p.id !== design.referenceId), basePhoto: current.planning?.photos.find((p) => p.id === design.referenceId) }, current.versions.find((v) => v.number === design.baseVersionNumber)?.id);
    }} /></PageShell>;

  const unverified = mode === "chat" && selected.number > 0 && !selected.verified;
  const canStartFresh = mode === "chat" && selected.number > 0 && !busy;
  const canRedo = canStartFresh && canRedoFree(versions, selected);

  const panel =
    mode === "draw" ? (
      <AddSomethingPanel
        project={project}
        drawings={draw.present}
        selectedId={selDrawing}
        onSelect={setSelDrawing}
        activeItem={activeItem}
        onPick={pickItem}
        onUpdate={updateDrawing}
        onDelete={deleteDrawing}
        draftId={draftId}
        onFinishDraft={() => setDraftId(null)}
        onUndoDot={undoDot}
        brush={brush}
        setBrush={setBrush}
        model={model}
        calibration={calibration}
        units={units}
        onToggleKeep={toggleKeep}
      />
    ) : mode === "measure" && calHist ? (
      <RoomSizePanel
        calibration={calHist.present}
        spaceType={project.spaceType as SpaceType}
        status={scaleStatus}
        onRoomSize={onRoomSize}
        onUnits={onUnits}
        pending={pending}
        onSavePending={onSavePending}
        checkPending={(lengthM, kind) => (pending ? referenceProblem(calHist.present, { id: "check", kind, a: pending.a, b: pending.b, lengthM, source: "user" }) : null)}
        onRemovePending={() => {
          if (pending?.ref) pushCal(removeReference(calHist.present, pending.ref.id));
          setPending(null);
        }}
        onCancelPending={() => setPending(null)}
        onFloorCorners={() => setCalTool((t) => (t === "floor" ? "none" : "floor"))}
        onClearFloor={() => pushCal(clearFloorRect(calHist.present))}
        floorMode={calTool === "floor"}
        onSave={() => void saveMeasure()}
        saving={savingCal}
      />
    ) : showMeasure && shownDrawings.length > 0 ? (
      <GettingPanel
        project={project}
        drawings={shownDrawings}
        model={model}
        calibration={calibration}
        units={units}
        chips={chips}
        onChip={onChip}
        message={message}
        setMessage={setMessage}
        onSend={() => send()}
        busy={busy}
        onRoomSize={enterMeasure}
        scaleStatus={scaleStatus}
      />
    ) : (
      <AssistantPanel
        project={project}
        selected={selected}
        onToggleKeep={toggleKeep}
        chips={chips}
        onChip={onChip}
        message={message}
        setMessage={setMessage}
        onSend={() => send()}
        busy={busy}
        stage={busy ? busyStage : null}
        onAddSomething={() => enterDraw()}
        onPaint={() => enterDraw("change-area")}
        onRemove={() => enterDraw("remove-area")}
        onPlan={() => setPlanOpen(true)}
        onRoomSize={enterMeasure}
        scaleSet={scaleStatus === "user" || scaleStatus === "suspect"}
      />
    );

  return (
    <PageShell header={header}>
      <main className="mx-auto grid max-w-[1400px] gap-5 px-4 py-4 md:px-6 md:py-6 lg:grid-cols-[minmax(0,65fr)_minmax(340px,35fr)] lg:gap-7">
        <section className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {editingTitle ? (
              <form
                className="flex flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const t = String(new FormData(e.currentTarget).get("title") ?? "").trim();
                  setEditingTitle(false);
                  if (t && t !== project.title) void patch({ title: t.slice(0, 80) });
                }}
              >
                <input name="title" autoFocus defaultValue={project.title} maxLength={80} aria-label="Project name" className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-xl font-extrabold outline-none" />
                <Button type="submit">Save</Button>
              </form>
            ) : (
              <h1 className="hidden min-w-0 items-center gap-2 text-2xl font-extrabold md:flex md:text-3xl">
                <span className="truncate">{project.title}</span>
                <button type="button" aria-label="Rename project" onClick={() => setEditingTitle(true)} className="grid size-9 place-items-center rounded-full text-muted hover:bg-sand">
                  <Pencil className="size-4" />
                </button>
              </h1>
            )}
            <span
              className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold", project.where === "server" ? "bg-forest-soft text-forest" : "bg-sand text-ink")}
              title={project.where === "server" ? "Saved online - open it on your phone or computer" : "Saved only on this device"}
            >
              {project.where === "server" ? <Cloud className="size-3.5" /> : <Smartphone className="size-3.5" />}
              {project.where === "server" ? "Online" : "This device"}
            </span>
            {showSwitches && (
              <div className="ml-auto flex flex-wrap items-center gap-3">
                {mode === "chat" && canCompare && (
                  <Segmented
                    label="Show"
                    size="sm"
                    value={effectiveView}
                    onChange={setView}
                    options={[
                      { value: "compare", label: "Slider" },
                      { value: "before", label: "Before" },
                      { value: "after", label: "After" },
                    ]}
                  />
                )}
                <Switch
                  label="Measurements"
                  checked={showMeasure}
                  onChange={(on) => {
                    setShowMeasure(on);
                    if (on && view === "compare") setView("after");
                  }}
                />
              </div>
            )}
          </div>

          {photo}

          {unverified && (
            <div className="flex flex-wrap items-start gap-3 rounded-2xl bg-amber-soft p-3">
              <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-800" />
              <p className="min-w-0 flex-1 text-sm font-semibold text-amber-900">
                Heads up: this one may have changed something you wanted to keep{selected.problems.length ? ` (${selected.problems.slice(0, 2).join("; ")})` : ""}. You weren&apos;t charged.
              </p>
            </div>
          )}
          {showMeasure && model === null && mode !== "measure" && (
            <p className="flex items-center gap-2 text-sm font-semibold text-muted">
              <Ruler className="size-4" /> Set the size of your photo to see measurements.
              <button type="button" className="font-bold text-forest underline" onClick={enterMeasure}>
                Set the size
              </button>
            </p>
          )}

          {toolbar}

          {!touch && mode !== "measure" && canCompare && <p className="hidden text-xs text-muted md:block">Tip: hold Space to see your original photo. Ctrl+Z undoes.</p>}

          {canStartFresh && (
            <div className="text-sm">
              {complaintOpen ? (
                <form
                  className="flex flex-col gap-2 sm:flex-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void redoFree();
                  }}
                >
                  <input
                    autoFocus
                    value={complaint}
                    onChange={(e) => setComplaint(e.target.value)}
                    maxLength={300}
                    placeholder="What's wrong? e.g. the window disappeared"
                    aria-label="What's wrong"
                    className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-[16px] outline-none"
                  />
                  <Button type="submit">Redo it free</Button>
                  <Button variant="ghost" onClick={() => setComplaintOpen(false)}>
                    Cancel
                  </Button>
                </form>
              ) : (
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {canRedo && (
                    <button type="button" onClick={() => setComplaintOpen(true)} className="font-bold text-forest underline-offset-2 hover:underline">
                      Something&apos;s wrong? Redo it free
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      selectVersion(original.id);
                      toast("Back to your original photo. Your next change starts from here; your other versions are kept.", "info");
                    }}
                    className="font-bold text-ink underline-offset-2 hover:underline"
                  >
                    Start fresh from the original
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">{panel}</aside>
      </main>
      {outOfCredits && (
        <OutOfCreditsSheet
          onClose={() => setOutOfCredits(false)}
          onDownload={() => {
            setOutOfCredits(false);
            void download(overlays.length > 0);
          }}
        />
      )}
    </PageShell>
  );
}

async function waitFor(j: CJob, signal: AbortSignal, onUpdate: (j: CJob) => void): Promise<CJob> {
  if (j.status === "succeeded" || j.status === "failed") return j;
  return waitForJob(j.id, onUpdate, signal);
}
