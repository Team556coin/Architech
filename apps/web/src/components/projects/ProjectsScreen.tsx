"use client";

import { Button, cn } from "@architech/ui";
import { Cloud, EllipsisVertical, Plus, Smartphone, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageShell } from "@/components/AppHeader";
import { PhotoPicker, type PhotoPickerHandle } from "@/components/PhotoPicker";
import { useSession, useToast } from "@/components/Providers";
import { ApiError } from "@/lib/api";
import { listAll, moveToDevice, moveToServer, removeProject, updateProject, loadProject } from "@/lib/projects";
import type { CSummary } from "@/lib/types";
import { usePhotoIntake } from "@/lib/use-photo-intake";

export function ProjectsScreen() {
  const { me, loading, refresh } = useSession();
  const router = useRouter();
  const toast = useToast();
  const picker = useRef<PhotoPickerHandle>(null);
  const { take, busy: intakeBusy } = usePhotoIntake();
  const [items, setItems] = useState<CSummary[] | null>(null);
  const [serverCount, setServerCount] = useState(0);
  const [max, setMax] = useState(5);
  const [offline, setOffline] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [swapFor, setSwapFor] = useState<CSummary | null>(null);

  const reload = useCallback(async () => {
    if (!me?.user) return;
    try {
      const r = await listAll(me.user.id);
      setItems(r.projects);
      setServerCount(r.serverCount);
      setMax(r.max);
      setOffline(r.offline);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) router.replace("/sign-in?next=/projects");
    }
  }, [me, router]);

  useEffect(() => {
    if (!loading && !me?.user) router.replace("/sign-in?next=/projects");
    else void reload();
  }, [loading, me, reload, router]);

  const run = async (id: string, fn: () => Promise<unknown>, done?: string) => {
    setMenu(null);
    setBusyId(id);
    try {
      await fn();
      if (done) toast(done, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "That didn't work.", "error");
    } finally {
      setBusyId(null);
      await reload();
      await refresh();
    }
  };

  const toDevice = (p: CSummary) => run(p.id, () => moveToDevice(me!.user!.id, p.id), `"${p.title}" is now saved on this device.`);
  const toServer = (p: CSummary) => {
    if (serverCount >= max) {
      setMenu(null);
      setSwapFor(p);
      return;
    }
    return run(p.id, () => moveToServer(p.id), `"${p.title}" is now saved online.`);
  };
  const swap = async (out: CSummary) => {
    const target = swapFor!;
    setSwapFor(null);
    await run(
      target.id,
      async () => {
        await moveToDevice(me!.user!.id, out.id);
        await moveToServer(target.id);
      },
      `Swapped: "${target.title}" is online, "${out.title}" is on this device.`,
    );
  };

  const rename = async (p: CSummary) => {
    const title = window.prompt("Project name", p.title)?.trim();
    if (!title || title === p.title) return setMenu(null);
    await run(p.id, async () => {
      const full = await loadProject(p.id);
      if (full) await updateProject(full, { title: title.slice(0, 60) });
    });
  };

  const remove = async (p: CSummary) => {
    if (!window.confirm(`Delete "${p.title}" and all its versions? This can't be undone.`)) return setMenu(null);
    await run(p.id, () => removeProject(p), "Project deleted.");
  };

  const serverItems = items?.filter((p) => p.where === "server") ?? [];

  return (
    <PageShell>
      <PhotoPicker ref={picker} onPick={(f) => void take(f)} />
      <main className="mx-auto max-w-[1400px] px-5 py-6 md:px-8 md:py-8">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-[34px] font-extrabold tracking-tight text-forest md:text-4xl">My projects</h1>
          <Button size="md" className="h-12 rounded-2xl px-5 text-[16px]" disabled={intakeBusy} onClick={() => picker.current?.gallery()}>
            <Plus className="size-5" /> {intakeBusy ? "Adding..." : "New photo"}
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white/70 px-4 py-3 text-[15px]">
          <span className="inline-flex items-center gap-2 font-bold text-forest">
            <Cloud className="size-5" /> Online: {items === null ? "..." : serverCount} of {max}
          </span>
          <span className="text-muted">Online projects show on your phone and computer. The rest stay on this device. Use the ⋮ menu to choose which {max} are online.</span>
          {offline && <span className="font-semibold text-red-700">You're offline. Showing projects on this device.</span>}
        </div>

        {items === null ? (
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl bg-sand" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="mt-10 rounded-3xl border-2 border-dashed border-line p-10 text-center">
            <p className="text-xl font-bold">No projects yet</p>
            <p className="mt-1 text-muted">Take a photo of a room or your yard to start.</p>
            <Button size="lg" className="mt-6" onClick={() => picker.current?.camera()}>
              Take a photo
            </Button>
          </div>
        ) : (
          <ul className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5 xl:grid-cols-4">
            {items.map((p) => (
              <li key={p.id} className={cn("relative overflow-hidden rounded-2xl border border-line bg-white shadow-sm", busyId === p.id && "opacity-60")} data-testid="project-card">
                <Link href={`/p/${p.id}`} className="block">
                  <div className="relative aspect-[4/3] bg-sand">
                    {p.coverUrl && <img src={p.coverUrl} alt="" className="size-full object-cover" />}
                    {p.versionCount > 1 && p.originalUrl && (
                      <div className="absolute right-2 top-2 w-[34%] overflow-hidden rounded-lg border-2 border-white bg-white shadow">
                        <span className="block bg-white px-1.5 text-[11px] font-bold leading-5 text-ink">Before</span>
                        <img src={p.originalUrl} alt="" className="aspect-[4/3] w-full object-cover" />
                      </div>
                    )}
                  </div>
                  <div className="px-3 pb-3 pt-2.5">
                    <p className="truncate text-[17px] font-bold text-forest">{p.title}</p>
                    <p className="flex items-center gap-1.5 text-sm text-muted">
                      {p.versionCount} version{p.versionCount === 1 ? "" : "s"}
                      <span aria-hidden>·</span>
                      {p.where === "server" ? (
                        <span className="inline-flex items-center gap-1 text-forest">
                          <Cloud className="size-3.5" /> Online
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Smartphone className="size-3.5" /> This device
                        </span>
                      )}
                    </p>
                  </div>
                </Link>
                <button
                  type="button"
                  aria-label={`Options for ${p.title}`}
                  onClick={() => setMenu(menu === p.id ? null : p.id)}
                  className="absolute bottom-2.5 right-2 grid size-9 place-items-center rounded-full text-muted hover:bg-sand"
                >
                  <EllipsisVertical className="size-5" />
                </button>
                {menu === p.id && (
                  <div className="absolute bottom-12 right-2 z-20 w-56 rounded-2xl border border-line bg-white p-1.5 shadow-xl">
                    {p.where === "server" ? (
                      <MenuItem onClick={() => void toDevice(p)}>
                        <Smartphone className="size-4" /> Keep on this device only
                      </MenuItem>
                    ) : (
                      <MenuItem onClick={() => void toServer(p)}>
                        <Cloud className="size-4" /> Save online
                      </MenuItem>
                    )}
                    <MenuItem onClick={() => void rename(p)}>Rename</MenuItem>
                    <MenuItem danger onClick={() => void remove(p)}>
                      Delete
                    </MenuItem>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>

      {swapFor && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/40 md:place-items-center" role="dialog" aria-modal aria-label="Choose a project to move">
          <div className="w-full max-w-lg rounded-t-3xl bg-cream p-6 md:rounded-3xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-extrabold text-forest">Your {max} online spots are full</h2>
                <p className="mt-1 text-muted">Pick one to keep on this device instead, and &quot;{swapFor.title}&quot; will take its spot.</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setSwapFor(null)} className="grid size-10 place-items-center rounded-full hover:bg-sand">
                <X className="size-5" />
              </button>
            </div>
            <ul className="mt-4 space-y-2">
              {serverItems.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => void swap(s)} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-white p-2 text-left hover:border-forest">
                    {s.coverUrl ? <img src={s.coverUrl} alt="" className="h-14 w-20 rounded-xl object-cover" /> : <span className="h-14 w-20 rounded-xl bg-sand" />}
                    <span className="font-bold">{s.title}</span>
                    <span className="ml-auto pr-2 text-sm font-semibold text-forest">Move to device</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[15px] font-semibold hover:bg-sand", danger && "text-red-700")}>
      {children}
    </button>
  );
}
