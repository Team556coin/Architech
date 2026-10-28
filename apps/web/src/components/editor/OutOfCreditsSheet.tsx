"use client";

import { Button } from "@architech/ui";
import { Download, Sparkles, X } from "lucide-react";
import { useEffect } from "react";

export function OutOfCreditsSheet({ onClose, onDownload }: { onClose: () => void; onDownload: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/40 md:place-items-center" role="dialog" aria-modal aria-labelledby="ooc-title" onClick={onClose}>
      <div className="safe-bottom w-full max-w-md rounded-t-3xl bg-cream p-6 md:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <span className="grid size-12 place-items-center rounded-full bg-coral text-white">
            <Sparkles className="size-6" />
          </span>
          <button type="button" aria-label="Close" onClick={onClose} className="grid size-10 place-items-center rounded-full hover:bg-sand">
            <X className="size-5" />
          </button>
        </div>
        <h2 id="ooc-title" className="mt-3 text-2xl font-extrabold text-forest">
          You&apos;ve used all your free edits
        </h2>
        <p className="mt-2 text-[16px] text-ink">All your designs are saved. You can still look at them, compare them, and download or share them.</p>
        <p className="mt-2 text-[16px] text-muted">More edits are coming soon.</p>
        <div className="mt-6 flex flex-col gap-2">
          <Button size="lg" onClick={onDownload}>
            <Download className="size-5" /> Download this design
          </Button>
          <Button size="lg" variant="ghost" onClick={onClose}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}
