"use client";

import { Button, cn } from "@architech/ui";
import { Camera, ChevronRight, Image as ImageIcon, MessageCircleMore, PencilLine, Upload, WandSparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PageShell } from "@/components/AppHeader";
import { PhotoPicker, type PhotoPickerHandle } from "@/components/PhotoPicker";
import { useSession } from "@/components/Providers";
import { takePendingPhoto } from "@/lib/device-store";
import { usePhotoIntake, type IntakeStatus } from "@/lib/use-photo-intake";
import { StartPlan } from "./StartPlan";

const EXAMPLES = [
  { id: "bathroom", label: "Bathroom" },
  { id: "kitchen", label: "Kitchen" },
  { id: "bedroom", label: "Bedroom" },
  { id: "backyard", label: "Backyard" },
  { id: "front-yard", label: "Front yard" },
];

const STATUS_TEXT: Record<IntakeStatus, string> = {
  idle: "",
  preparing: "Getting your photo ready...",
  looking: "Looking at your space...",
  saving: "Setting up your project...",
};

export function HomeScreen() {
  const picker = useRef<PhotoPickerHandle>(null);
  const [idea, setIdea] = useState("");
  const { take, status, busy } = usePhotoIntake(idea);
  const { me, loading } = useSession();
  const params = useSearchParams();
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const resumed = useRef(false);

  useEffect(() => {
    if (loading || resumed.current || params.get("resume") !== "1" || !me?.user) return;
    resumed.current = true;
    router.replace("/");
    void takePendingPhoto().then((blob) => blob && take(blob));
  }, [loading, me, params, router, take]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (file) {
        e.preventDefault();
        void take(file);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [take]);

  const tryExample = async (id: string) => {
    const res = await fetch(`/examples/${id}.jpg`);
    const blob = await res.blob();
    void take(new File([blob], `${id}.jpg`, { type: "image/jpeg" }));
  };

  return (
    <PageShell>
      <PhotoPicker ref={picker} onPick={(f) => void take(f)} />
      <main className="mx-auto max-w-[1400px] px-5 pb-10 pt-6 md:px-8 md:pt-10">
        <div className="grid items-center gap-6 md:grid-cols-[1fr_1.1fr] md:gap-10">
          <section>
            <h1 className="text-[44px] font-extrabold leading-[1.02] tracking-tight text-forest md:text-[64px]">
              See your dream <span className="text-coral">space</span>
            </h1>
            <p className="mt-3 text-[17px] text-ink md:mt-5 md:text-xl">
              <span className="md:hidden">Snap a photo. Tell us what you want. See it real.</span>
              <span className="hidden md:inline">Upload a photo. Draw what you want. See it real.</span>
            </p>
            <ol className="mt-8 hidden items-center gap-6 text-[16px] font-semibold md:flex">
              <li className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-lg border-2 border-ink text-sm font-extrabold">1</span> Upload
              </li>
              <li className="h-6 w-px bg-line" />
              <li className="flex items-center gap-2.5">
                <PencilLine className="size-7" /> Draw or say it
              </li>
              <li className="h-6 w-px bg-line" />
              <li className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-full border-2 border-ink text-sm font-extrabold">3</span> See it
              </li>
            </ol>
          </section>

          <section
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void take(f);
            }}
            className={cn(
              "relative flex min-h-[280px] flex-col items-center justify-center rounded-[28px] border-2 border-dashed px-6 py-10 text-center transition md:min-h-[360px]",
              dragging ? "border-forest bg-forest-soft/60" : "border-forest/50 bg-white/40 md:border-line",
            )}
            data-testid="dropzone"
          >
            {busy ? (
              <div className="flex flex-col items-center gap-4" role="status">
                <span className="size-14 animate-spin rounded-full border-[5px] border-coral border-t-transparent" />
                <p className="text-xl font-bold text-forest">{STATUS_TEXT[status]}</p>
              </div>
            ) : (
              <>
                <Camera className="size-16 text-forest md:hidden" strokeWidth={1.6} />
                <ImageIcon className="hidden size-20 text-forest md:block" strokeWidth={1.6} />
                <p className="mt-4 hidden text-2xl font-bold md:block">Drag a photo here</p>
                <Button size="lg" className="mt-6 w-full max-w-xs text-xl md:hidden" onClick={() => picker.current?.camera()}>
                  <Camera className="size-6" /> Take a photo
                </Button>
                <button type="button" className="mt-4 text-[16px] font-semibold text-ink underline-offset-4 hover:underline md:hidden" onClick={() => picker.current?.gallery()}>
                  or choose from your photos
                </button>
                <Button size="lg" className="mt-6 hidden w-full max-w-sm text-xl md:inline-flex" onClick={() => picker.current?.gallery()}>
                  <Upload className="size-5" /> Choose a photo
                </Button>
                <p className="mt-4 hidden text-[15px] text-ink md:block">or paste with Ctrl+V</p>
              </>
            )}
          </section>
        </div>

        <ol className="mt-6 grid grid-cols-3 gap-2 text-center md:hidden">
          {[
            { n: 1, label: "Snap", Icon: Camera, tone: "text-forest border-forest" },
            { n: 2, label: "Say it", Icon: MessageCircleMore, tone: "text-coral border-coral" },
            { n: 3, label: "See it", Icon: WandSparkles, tone: "text-forest border-forest" },
          ].map(({ n, label, Icon, tone }) => (
            <li key={n} className="flex flex-col items-center gap-1.5">
              <span className="text-sm font-bold">{n}</span>
              <span className={cn("grid size-14 place-items-center rounded-full border-2", tone)}>
                <Icon className="size-6" />
              </span>
              <span className={cn("font-bold", n === 2 ? "text-coral" : "text-ink")}>{label}</span>
            </li>
          ))}
        </ol>

        <label className="mt-6 block font-semibold text-forest">Have an idea already? <span className="font-normal text-muted">(optional)</span><input aria-label="Your project idea" value={idea} maxLength={2000} onChange={(e) => setIdea(e.target.value)} placeholder="A covered patio, outdoor kitchen, and seating for six..." className="mt-2 h-12 w-full rounded-xl border border-line bg-white px-4 text-base font-normal" /></label>
        <StartPlan />
        <section className="mt-8 md:mt-12">
          <h2 className="flex items-center justify-between text-xl font-bold text-forest md:text-2xl">
            <span>
              <span className="md:hidden">Try it on...</span>
              <span className="hidden md:inline">Try an example</span>
            </span>
            <ChevronRight className="size-5 text-coral md:hidden" />
          </h2>
          <div className="scrollbar-none -mx-5 mt-3 flex snap-x gap-3 overflow-x-auto px-5 md:mx-0 md:grid md:grid-cols-5 md:gap-4 md:overflow-visible md:px-0">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.id}
                type="button"
                disabled={busy}
                onClick={() => void tryExample(ex.id)}
                className="group relative aspect-[4/3] w-40 shrink-0 snap-start overflow-hidden rounded-2xl bg-sand shadow-sm md:w-auto"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/examples/${ex.id}.jpg`} alt="" className="size-full object-cover transition group-hover:scale-105" />
                <span className="absolute inset-x-3 bottom-2 rounded-xl bg-forest/85 py-1 text-[15px] font-bold text-white md:bg-black/45 md:backdrop-blur">{ex.label}</span>
              </button>
            ))}
          </div>
        </section>
        <p className="mt-8 text-center text-sm text-muted"><a href="/privacy" className="underline">Privacy notice</a></p>
      </main>
    </PageShell>
  );
}
