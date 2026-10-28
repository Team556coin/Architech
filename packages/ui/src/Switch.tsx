import { cn } from "./cn";

export interface SwitchProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  showLabel?: boolean;
  disabled?: boolean;
  className?: string;
}

export function Switch({ label, checked, onChange, showLabel = true, disabled, className }: SwitchProps) {
  return (
    <label className={cn("inline-flex items-center gap-2.5 font-semibold text-ink select-none", disabled && "opacity-50", className)}>
      {showLabel && <span>{label}</span>}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn("relative h-7 w-12 rounded-full transition", checked ? "bg-forest" : "bg-line")}
      >
        <span className={cn("absolute top-0.5 size-6 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
      </button>
    </label>
  );
}
