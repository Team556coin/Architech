"use client";

import { cn } from "@architech/ui";
import { ArrowUp, Mic, MicOff } from "lucide-react";
import type { CSSProperties } from "react";
import { useSpeech } from "@/lib/use-speech";
import { useToast } from "../Providers";

export function ChatInput({
  value,
  onChange,
  onSend,
  disabled,
  placeholder = "Tell me what to change next...",
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const toast = useToast();
  const speech = useSpeech(
    (text) => onChange(value.trim() ? `${value.trim()} ${text}` : text),
    (message) => toast(message, "error"),
  );
  return (
    <form
      className={cn("flex items-end gap-2 rounded-2xl border border-line bg-white p-2 shadow-sm focus-within:border-forest/50", disabled && "opacity-60")}
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled && value.trim()) onSend();
      }}
    >
      <textarea
        aria-label="Tell us what to change"
        value={value}
        disabled={disabled}
        rows={1}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!disabled && value.trim()) onSend();
          }
        }}
        placeholder={placeholder}
        className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-[16px] outline-none placeholder:text-muted"
        style={{ fieldSizing: "content" } as CSSProperties}
      />
      {speech.supported && (
        <button
          type="button"
          aria-label={speech.listening ? "Stop listening" : "Talk"}
          disabled={disabled}
          onClick={() => (speech.listening ? speech.stop() : speech.start())}
          className={cn("grid size-11 shrink-0 place-items-center rounded-full text-white", speech.listening ? "animate-pulse bg-coral" : "bg-forest")}
        >
          {speech.listening ? <MicOff className="size-5" /> : <Mic className="size-5" />}
        </button>
      )}
      <button type="submit" aria-label="Send" disabled={disabled || !value.trim()} className="grid size-11 shrink-0 place-items-center rounded-full bg-forest text-white disabled:bg-line">
        <ArrowUp className="size-5" />
      </button>
    </form>
  );
}
