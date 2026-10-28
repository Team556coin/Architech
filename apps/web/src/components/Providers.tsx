"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { Me } from "@/lib/types";
import { listenNativeGoogle } from "@/lib/native-google";

interface SessionValue {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<Me | null>;
  setCredits: (n: number) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession() {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession outside Providers");
  return v;
}

interface Toast {
  id: number;
  text: string;
  tone: "info" | "error" | "success";
}

const ToastContext = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function Providers({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  useEffect(() => {
    let disposed = false;
    let remove = () => {};
    void listenNativeGoogle().then((cleanup) => {
      if (disposed) cleanup();
      else remove = cleanup;
    }).catch(() => {});
    return () => { disposed = true; remove(); };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const m = await api.me();
      setMe(m);
      return m;
    } catch {
      setMe((prev) => prev ?? { user: null, aiReady: true });
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  const toast = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const session = useMemo<SessionValue>(
    () => ({ me, loading, refresh, setCredits: (n) => setMe((m) => (m ? { ...m, credits: n } : m)) }),
    [me, loading, refresh],
  );

  return (
    <SessionContext.Provider value={session}>
      <ToastContext.Provider value={toast}>
        {children}
        <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-8">
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              className={
                "pointer-events-auto max-w-md rounded-2xl px-4 py-3 text-[15px] font-semibold shadow-lg " +
                (t.tone === "error" ? "bg-red-700 text-white" : t.tone === "success" ? "bg-forest text-white" : "bg-ink text-white")
              }
            >
              {t.text}
            </div>
          ))}
        </div>
      </ToastContext.Provider>
    </SessionContext.Provider>
  );
}
