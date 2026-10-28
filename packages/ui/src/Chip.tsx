import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  selected?: boolean;
  /** Show a round check in front, like the "Keeping" chips. */
  checkmark?: boolean;
  tone?: "default" | "coral";
  icon?: ReactNode;
  children: ReactNode;
}

export function Chip({ selected, checkmark, tone = "default", icon, className, children, type = "button", ...rest }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl border px-3 h-9 text-sm font-semibold transition select-none",
        tone === "coral" && !selected && "bg-coral text-white border-coral",
        tone === "default" && !selected && "bg-white border-line text-ink hover:border-forest/40",
        selected && !checkmark && "bg-forest text-white border-forest",
        selected && checkmark && "bg-white border-line text-ink",
        className,
      )}
      {...rest}
    >
      {checkmark && (
        <span aria-hidden className={cn("grid size-5 place-items-center rounded-full text-white", selected ? "bg-forest" : "bg-line")}>
          <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5">
            {selected ? <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M4 8h8" strokeLinecap="round" />}
          </svg>
        </span>
      )}
      {icon}
      {children}
    </button>
  );
}
