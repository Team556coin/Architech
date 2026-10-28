import type { ReactNode } from "react";
import { cn } from "./cn";

export interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: ReactNode; disabled?: boolean }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
}

export function Segmented<T extends string>({ label, value, options, onChange, size = "md", className }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-xl border border-line bg-white p-0.5", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 rounded-[10px] font-semibold transition whitespace-nowrap disabled:opacity-40",
              size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-[15px]",
              on ? "bg-forest text-white shadow-sm" : "text-ink hover:bg-sand",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
