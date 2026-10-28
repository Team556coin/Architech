"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useSession, useToast } from "@/components/Providers";
import { api, ApiError } from "./api";
import { stashPendingPhoto } from "./device-store";
import { preparePhoto } from "./images";
import { createFromUpload } from "./projects";

export type IntakeStatus = "idle" | "preparing" | "looking" | "saving";

/** Turns a picked photo into a project and opens the editor. */
export function usePhotoIntake(initialMessage = "") {
  const { me, refresh } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState<IntakeStatus>("idle");

  const take = useCallback(
    async (file: Blob & { name?: string }) => {
      if (!file.type.startsWith("image/") && !/\.(heic|heif|jpe?g|png|webp)$/i.test(file.name ?? "")) {
        toast("That file doesn't look like a photo. Try a JPG or PNG.", "error");
        return;
      }
      if (!me?.user) {
        try { sessionStorage.setItem("homeredo:pending-idea", initialMessage); } catch { /* optional */ }
        await stashPendingPhoto(file);
        router.push("/sign-in?next=" + encodeURIComponent("/?resume=1"));
        return;
      }
      try {
        setStatus("preparing");
        const { blob, focal35 } = await preparePhoto(file);
        setStatus("looking");
        const upload = await api.uploadPhoto(blob, { analyze: true, focal35 });
        if (upload.analysisError) toast(upload.analysisError);
        setStatus("saving");
        const fresh = (await refresh()) ?? me;
        const serverHasRoom = (fresh.serverProjects ?? 0) < (fresh.maxServerProjects ?? 5);
        const created = await createFromUpload({ userId: me.user.id, upload, units: fresh.units ?? "imperial", serverHasRoom });
        try {
          const idea = initialMessage || sessionStorage.getItem("homeredo:pending-idea") || "";
          if (idea) sessionStorage.setItem(`homeredo:idea:${created.id}`, idea);
          sessionStorage.removeItem("homeredo:pending-idea");
        } catch { /* optional */ }
        if (created.where === "device") toast("Your 5 online spots are full, so this project is saved on this device.");
        await refresh();
        router.push(`/p/${created.id}`);
      } catch (e) {
        setStatus("idle");
        if (e instanceof ApiError && e.status === 401) {
          await stashPendingPhoto(file);
          router.push("/sign-in?next=" + encodeURIComponent("/?resume=1"));
          return;
        }
        toast(e instanceof Error ? e.message : "Something went wrong. Please try again.", "error");
      }
    },
    [me, refresh, router, toast, initialMessage],
  );

  return { take, status, busy: status !== "idle" };
}
