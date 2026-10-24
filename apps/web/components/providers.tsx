"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";
import { ApiError, setUnauthorizedHandler } from "@/lib/api";

// ---------- Toasts (never the only explanation of a failure) ----------
interface Toast { id: number; kind: "success" | "error"; message: string }
const ToastContext = createContext<{ push: (kind: Toast["kind"], message: string) => void }>({ push: () => undefined });
export const useToast = () => useContext(ToastContext);

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (kind: Toast["kind"], message: string) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-3), { id, kind, message }]);
      setTimeout(() => dismiss(id), kind === "error" ? 9000 : 5000);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="region" aria-label="Notifications" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === "error" ? "alert" : "status"}>
            {t.kind === "success" ? <CheckCircle2 size={18} aria-hidden /> : <AlertTriangle size={18} aria-hidden />}
            <span>{t.message}</span>
            <button type="button" className="icon-btn" aria-label="Dismiss message" onClick={() => dismiss(t.id)}>
              <X size={16} aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ---------- Unsaved-changes guard for the settings forms ----------
interface Guard { register: (key: string, dirty: boolean) => void; isDirty: () => boolean }
const GuardContext = createContext<Guard>({ register: () => undefined, isDirty: () => false });

function GuardProvider({ children }: { children: ReactNode }) {
  const dirty = useRef(new Set<string>());
  const guard = useMemo<Guard>(
    () => ({
      register: (key, isDirty) => void (isDirty ? dirty.current.add(key) : dirty.current.delete(key)),
      isDirty: () => dirty.current.size > 0,
    }),
    [],
  );
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current.size > 0) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);
  return <GuardContext.Provider value={guard}>{children}</GuardContext.Provider>;
}
export const useGuard = () => useContext(GuardContext);

/** Register a form's dirty state; cleans up when the form unmounts. */
export function useDirty(key: string, dirty: boolean) {
  const g = useGuard();
  useEffect(() => {
    g.register(key, dirty);
    return () => g.register(key, false);
  }, [g, key, dirty]);
}

// ---------- Root ----------
export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // A click made while offline must fail visibly now, not sit in a hidden queue and fire on reconnect.
          mutations: { networkMode: "always" },
          queries: {
            retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
            refetchOnWindowFocus: true,
            staleTime: 1000,
          },
        },
      }),
  );
  const redirecting = useRef(false);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (redirecting.current || window.location.pathname.startsWith("/login")) return;
      redirecting.current = true;
      const here = window.location.pathname + window.location.search;
      client.clear();
      router.replace(`/login?returnTo=${encodeURIComponent(here)}`);
      setTimeout(() => (redirecting.current = false), 1500);
    });
    return () => setUnauthorizedHandler(null);
  }, [client, router]);

  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <GuardProvider>{children}</GuardProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
