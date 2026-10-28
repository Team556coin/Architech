"use client";

import { getLook, looksFor, type Drawing, type Look } from "@architech/core";
import { cn } from "@architech/ui";
import { ImagePlus, Loader2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { useToast } from "@/components/Providers";
import { api } from "@/lib/api";
import { preparePhoto } from "@/lib/images";

/** Pick the boards: match the fence already in the photo, a preset, or a picture of the boards. */
export function LookField({ d, onChange }: { d: Drawing; onChange: (look: Look) => void }) {
  const presets = looksFor(d.itemType);
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!presets.length) return null;
  const source = d.look?.source ?? "existing";
  const presetId = d.look?.presetId;
  const photoKey = d.look?.photoKey;
  const choose = (look: Look) => onChange({ ...look, ...(photoKey ? { photoKey } : {}), ...(presetId ? { presetId: look.presetId ?? presetId } : {}) });

  const upload = async (picked: File) => {
    setBusy(true);
    try {
      const { blob } = await preparePhoto(picked);
      const up = await api.uploadPhoto(blob, { analyze: false });
      onChange({ source: "photo", photoKey: up.key, ...(presetId ? { presetId } : {}) });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't use that photo. Try another one.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="mb-1.5 text-sm font-bold">Boards</p>
      <div className="grid grid-cols-3 gap-2">
        <Swatch selected={source === "existing"} label="Match photo" onClick={() => choose({ source: "existing" })}>
          <span className="flex h-full items-center justify-center px-2 text-center text-[11px] font-bold leading-tight text-forest">Same as the fence already in this photo</span>
        </Swatch>
        {presets.map((p) => (
          <Swatch key={p.id} selected={source === "preset" && (presetId ?? presets[0]?.id) === p.id} label={p.label} onClick={() => choose({ source: "preset", presetId: p.id })}>
            <img alt="" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(p.svg)}`} className="h-full w-full object-cover" />
          </Swatch>
        ))}
        <Swatch
          selected={source === "photo"}
          label="Your photo"
          disabled={busy}
          onClick={() => {
            if (photoKey && source !== "photo") choose({ source: "photo" });
            else file.current?.click();
          }}
        >
          {photoKey ? (
            <img alt="Your fence boards" src={`/api/files/${photoKey}`} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full flex-col items-center justify-center gap-1 text-forest">
              {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
              <span className="text-[11px] font-bold">{busy ? "Uploading" : "Add a photo"}</span>
            </span>
          )}
        </Swatch>
      </div>
      <input
        ref={file}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        aria-label="Photo of the boards"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />
      <p className="mt-1.5 text-xs text-muted">
        {source === "existing" ? "The new fence copies the boards already in the photo." : source === "photo" ? "The new fence copies the boards in your photo." : getLook(d.itemType, presetId)?.prompt}
      </p>
    </div>
  );
}

function Swatch({ selected, label, onClick, disabled, children }: { selected: boolean; label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn("overflow-hidden rounded-xl border bg-white text-left disabled:opacity-60", selected ? "border-forest ring-2 ring-forest" : "border-line hover:border-forest/40")}
    >
      <span className="block aspect-[4/3] bg-sand">{children}</span>
      <span className="block truncate px-1 py-1 text-center text-[11px] font-bold">{label}</span>
    </button>
  );
}
