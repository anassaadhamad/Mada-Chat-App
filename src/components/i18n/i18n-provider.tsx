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
import {
  defaultLocale,
  localeDirection,
  locales,
  type Locale,
} from "@/i18n/config";
import ar from "@/i18n/messages/ar.json";
import en from "@/i18n/messages/en.json";
import fr from "@/i18n/messages/fr.json";
import { translate, type MessageTree } from "@/i18n/translate";
import { publicApiUrl } from "@/lib/env-public";

const catalog: Record<Locale, MessageTree> = {
  en: en as MessageTree,
  fr: fr as MessageTree,
  ar: ar as MessageTree,
};

const STORAGE_KEY = "secret-chat-locale";

type I18nContextValue = {
  locale: Locale;
  /** When `fromServer` is true, skips persisting to the API (used after GET /api/me/preferences). */
  setLocale: (locale: Locale, fromServer?: boolean) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  dir: "ltr" | "rtl";
};

const I18nContext = createContext<I18nContextValue | null>(null);

type I18nProviderProps = {
  children: ReactNode;
  /** When set (e.g. after GET /api/me/preferences), skips reading stale locale from localStorage first. */
  initialFromServer?: Locale;
};

export function I18nProvider({ children, initialFromServer }: I18nProviderProps) {
  const { data: session, status } = useSession();
  const [locale, setLocaleState] = useState<Locale>(initialFromServer ?? defaultLocale);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      if (initialFromServer && locales.includes(initialFromServer)) {
        setLocaleState(initialFromServer);
        localStorage.setItem(STORAGE_KEY, initialFromServer);
        setMounted(true);
        return;
      }
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && locales.includes(stored as Locale)) {
        setLocaleState(stored as Locale);
      }
      setMounted(true);
    });
  }, [initialFromServer]);

  const setLocale = useCallback(
    (next: Locale, fromServer = false) => {
      setLocaleState(next);
      localStorage.setItem(STORAGE_KEY, next);
      if (fromServer) return;
      if (status !== "authenticated" || !session?.user?.id) return;
      void fetch(publicApiUrl("/api/me/preferences"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
    },
    [status, session?.user?.id]
  );

  const messages = catalog[locale] ?? catalog[defaultLocale];

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      translate(messages, key, params),
    [messages]
  );

  const dir = localeDirection[locale];

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir, mounted]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      dir,
    }),
    [locale, setLocale, t, dir]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}
