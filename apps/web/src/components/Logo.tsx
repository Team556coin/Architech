export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M4 15 16 4.5 28 15v12a1.5 1.5 0 0 1-1.5 1.5h-21A1.5 1.5 0 0 1 4 27z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <g className="text-coral">
        <path d="M20.5 17.4A5.2 5.2 0 1 1 14.22 15.11" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M13.2 12.29 17.79 13.81 15.25 17.93z" fill="currentColor" stroke="currentColor" strokeWidth="0.8" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 text-forest">
      <LogoMark />
      <span className="text-[22px] font-extrabold tracking-tight">HomeRedo</span>
    </span>
  );
}
