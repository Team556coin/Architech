"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@architech/ui";
import { designAlternativeSchema, planningSchema, type SpaceType } from "@architech/core";
import { useSession, useToast } from "../Providers";
import { api } from "@/lib/api";
import { createFromUpload, loadProject, updateProject } from "@/lib/projects";
import { uid } from "@/lib/uid";

export function StartPlan() {
  const { me, refresh } = useSession();
  const toast = useToast(), router = useRouter();
  const [busy, setBusy] = useState(false);
  const [space, setSpace] = useState<SpaceType>("backyard");
  const start = async () => {
    if (!me?.user) { router.push("/sign-in?next=" + encodeURIComponent("/?startPlan=1")); return; }
    setBusy(true);
    try {
      const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 800;
      const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#f5f2e8"; ctx.fillRect(0, 0, 1200, 800);
      const image = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error("Could not create layout")), "image/jpeg", 0.8));
      const upload = await api.uploadPhoto(image, { analyze: false });
      upload.analysis = { spaceType: space, title: "My layout", summary: "A layout started without a photo.", keep: [], suggestions: [], references: [], horizonY: null };
      const fresh = (await refresh()) ?? me;
      const created = await createFromUpload({ userId: me.user.id, upload, units: fresh.units ?? "imperial", serverHasRoom: (fresh.serverProjects ?? 0) < (fresh.maxServerProjects ?? 5) });
      const p = await loadProject(created.id);
      if (!p) throw new Error("Could not open the new project.");
      const alternative = designAlternativeSchema.parse({ id: uid(), name: "My design", units: fresh.units ?? "imperial" });
      const planning = planningSchema.parse({ revision: 1, activeId: alternative.id, alternatives: [alternative] });
      await updateProject(p, { planning, expectedPlanningRevision: 0 });
      router.push(`/p/${p.id}?plan=1`);
    } catch (e) { toast(e instanceof Error ? e.message : "Could not create the project.", "error"); setBusy(false); }
  };
  return <details className="mt-6 rounded-2xl border border-line bg-white/60 p-4"><summary className="cursor-pointer font-bold text-forest">Start without a photo</summary><p className="my-3 text-sm text-muted">Build a layout with dimensions and 3D shapes. Add reference photos later.</p><div className="flex flex-wrap gap-3"><select aria-label="New layout space" value={space} onChange={(e) => setSpace(e.target.value as SpaceType)} className="rounded-xl border border-line bg-white px-3 py-2"><option value="backyard">Yard or patio</option><option value="kitchen">Kitchen</option><option value="living-room">Room</option><option value="other">Something else</option></select><Button disabled={busy} onClick={() => void start()}>{busy ? "Creating..." : "Start a layout"}</Button></div></details>;
}
