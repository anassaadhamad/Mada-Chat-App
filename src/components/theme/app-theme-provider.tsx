"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import type { AppTheme } from "@/lib/user-preferences";
import { publicApiUrl } from "@/lib/env-public";

export type { AppTheme } from "@/lib/user-preferences";

const STORAGE_KEY = "secret-chat-theme";

function resolveDark(theme: AppTheme): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyThemeClass(theme: AppTheme) {
  document.documentElement.classList.toggle("dark", resolveDark(theme));
}

type ThemeContextValue = {
  theme: AppTheme;
  /** When `fromServer` is true, skips persisting to the API (used after GET /api/me/preferences). */
  setTheme: (theme: AppTheme, fromServer?: boolean) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

type AppThemeProviderProps = {
  children: ReactNode;
  /** When set (e.g. after GET /api/me/preferences), skips reading stale theme from localStorage first. */
  initialFromServer?: AppTheme;
};

export function AppThemeProvider({ children, initialFromServer }: AppThemeProviderProps) {
  const { data: session, status } = useSession();
  const [theme, setThemeState] = useState<AppTheme>(initialFromServer ?? "system");

  useEffect(() => {
    queueMicrotask(() => {
      if (initialFromServer === "light" || initialFromServer === "dark" || initialFromServer === "system") {
        setThemeState(initialFromServer);
        localStorage.setItem(STORAGE_KEY, initialFromServer);
        return;
      }
      const stored = localStorage.getItem(STORAGE_KEY) as AppTheme | null;
      if (stored === "light" || stored === "dark" || stored === "system") {
        setThemeState(stored);
      }
    });
  }, [initialFromServer]);

  useEffect(() => {
    applyThemeClass(theme);
    localStorage.setItem(STORAGE_KEY, theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyThemeClass("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback(
    (next: AppTheme, fromServer = false) => {
      setThemeState(next);
      localStorage.setItem(STORAGE_KEY, next);
      if (fromServer) return;
      if (status !== "authenticated" || !session?.user?.id) return;
      void fetch(publicApiUrl("/api/me/preferences"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: next }),
      });
    },
    [status, session?.user?.id]
  );

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useAppTheme must be used within AppThemeProvider");
  }
  return ctx;
}
