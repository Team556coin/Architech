"use client";

import { cn } from "@architech/ui";
import { Folder, House, LogOut, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { useTyping } from "@/lib/keyboard";
import { Logo } from "./Logo";
import { useSession } from "./Providers";

export function CreditsPill({ className }: { className?: string }) {
  const { me, loading } = useSession();
  if (loading && !me) return <span className={cn("inline-block h-10 w-32 animate-pulse rounded-full bg-sand", className)} aria-hidden />;
  const n = me?.user ? (me.credits ?? 0) : 20;
  return (
    <span className={cn("inline-flex h-10 items-center gap-1.5 rounded-full bg-coral px-4 text-[15px] font-bold text-white shadow-sm", className)} data-testid="credits">
      <Sparkles className="size-4" aria-hidden />
      {n} free edit{n === 1 ? "" : "s"}
    </span>
  );
}

function Avatar() {
  const { me, loading, refresh } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (loading && !me) return <span className="block size-10 animate-pulse rounded-full bg-sand" aria-hidden />;
  if (!me?.user) {
    return (
      <Link href="/sign-in" className="inline-flex h-10 items-center rounded-full bg-forest px-5 font-bold text-white hover:bg-forest-dark">
        Sign in
      </Link>
    );
  }
  const initial = (me.user.name || me.user.email).trim().charAt(0).toUpperCase();
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Account"
        onClick={() => setOpen((o) => !o)}
        className="grid size-10 place-items-center rounded-full bg-forest text-lg font-extrabold text-white ring-2 ring-white shadow"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-56 rounded-2xl border border-line bg-white p-2 shadow-xl" onMouseLeave={() => setOpen(false)}>
          <p className="truncate px-3 py-2 text-sm text-muted">{me.user.email}</p>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left font-semibold hover:bg-sand"
            onClick={async () => {
              await authClient.signOut();
              await refresh();
              setOpen(false);
              router.push("/");
            }}
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

const nav = [
  { href: "/", label: "Home", Icon: House },
  { href: "/projects", label: "My projects", Icon: Folder },
];

export function AppHeader({ left }: { left?: ReactNode }) {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-cream/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4 md:h-[72px] md:px-6">
        {left ?? (
          <Link href="/" aria-label="HomeRedo home">
            <Logo />
          </Link>
        )}
        <nav className="mx-auto hidden items-center gap-8 md:flex">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className={cn("text-[16px] font-semibold", path === n.href ? "text-forest" : "text-ink hover:text-forest")}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 md:ml-0">
          <CreditsPill className="h-9 px-3 text-sm md:h-10 md:px-4 md:text-[15px]" />
          <span className="hidden md:block">
            <Avatar />
          </span>
        </div>
      </div>
    </header>
  );
}

export function BottomNav() {
  const path = usePathname();
  const { me, loading } = useSession();
  const pending = loading && !me;
  const typing = useTyping();
  return (
    <nav className={cn("safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-cream/95 backdrop-blur md:hidden", typing && "hidden")}>
      <div className="mx-auto grid max-w-md grid-cols-3 gap-2 px-3 py-2">
        {nav.map(({ href, label, Icon }) => {
          const on = href === "/" ? path === "/" || path.startsWith("/p/") : path.startsWith(href);
          return (
            <Link key={href} href={href} className={cn("flex flex-col items-center gap-0.5 rounded-2xl py-2 text-sm font-semibold", on ? "bg-forest-soft text-forest" : "text-muted")}>
              <Icon className="size-6" aria-hidden />
              {label}
            </Link>
          );
        })}
        <Link href={me?.user ? "/account" : "/sign-in"} className={cn("flex flex-col items-center gap-0.5 rounded-2xl py-2 text-sm font-semibold", path === "/account" || path === "/sign-in" ? "bg-forest-soft text-forest" : "text-muted")}>
          <span className={cn("grid size-6 place-items-center rounded-full text-xs font-extrabold text-white", pending ? "animate-pulse bg-sand" : "bg-forest")}>
            {pending ? "" : (me?.user?.name || me?.user?.email || "?").charAt(0).toUpperCase()}
          </span>
          {me?.user || pending ? "Account" : "Sign in"}
        </Link>
      </div>
    </nav>
  );
}

export function PageShell({ children, header }: { children: ReactNode; header?: ReactNode }) {
  return (
    <div className="min-h-dvh pb-24 md:pb-0">
      {header ?? <AppHeader />}
      {children}
      <BottomNav />
    </div>
  );
}
