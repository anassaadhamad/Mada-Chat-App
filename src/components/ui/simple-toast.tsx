"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type ToastKind = "error" | "success";

type ToastPayload = { id: number; message: string; kind: ToastKind };

type SimpleToastContextValue = {
  show: (message: string, kind?: ToastKind) => void;
};

const SimpleToastContext = createContext<SimpleToastContextValue | null>(null);

export function useSimpleToast(): SimpleToastContextValue {
  const ctx = useContext(SimpleToastContext);
  if (!ctx) {
    return { show: () => {} };
  }
  return ctx;
}

export function SimpleToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const show = useCallback(
    (message: string, kind: ToastKind = "error") => {
      clearTimer();
      idRef.current += 1;
      const id = idRef.current;
      setToast({ id, message, kind });
      timerRef.current = setTimeout(() => {
        setToast((cur) => (cur?.id === id ? null : cur));
        timerRef.current = null;
      }, 4200);
    },
    [clearTimer]
  );

  useEffect(() => () => clearTimer(), [clearTimer]);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <SimpleToastContext.Provider value={value}>
      {children}
      {toast ? (
        toast.kind === "error" ? (
          <div
            role="alert"
            aria-live="assertive"
            className="pointer-events-none fixed bottom-6 start-4 end-4 z-[300] flex justify-center px-2"
          >
            <div
              className={cn(
                "pointer-events-auto max-w-md rounded-lg border px-4 py-3 text-center text-sm font-medium shadow-lg",
                "border-destructive/40 bg-destructive text-destructive-foreground"
              )}
            >
              {toast.message}
            </div>
          </div>
        ) : (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none fixed bottom-6 start-4 end-4 z-[300] flex justify-center px-2"
          >
            <div
              className={cn(
                "pointer-events-auto max-w-md rounded-lg border px-4 py-3 text-center text-sm font-medium shadow-lg",
                "border-emerald-500/40 bg-emerald-600 text-white"
              )}
            >
              {toast.message}
            </div>
          </div>
        )
      ) : null}
    </SimpleToastContext.Provider>
  );
}
