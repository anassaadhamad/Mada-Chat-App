"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { UserPreferencesDTO } from "@/lib/user-preferences";
import { publicApiUrl } from "@/lib/env-public";

type UserPreferencesContextValue = {
  preferences: UserPreferencesDTO | null;
  setPreferences: (p: UserPreferencesDTO | null) => void;
  patchPreferences: (patch: Partial<UserPreferencesDTO>) => Promise<void>;
  /** Instant UI; rolls back on failed PATCH. */
  optimisticPreferences: (patch: Partial<UserPreferencesDTO>) => void;
};

const UserPreferencesContext = createContext<UserPreferencesContextValue | null>(null);

export function UserPreferencesProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial: UserPreferencesDTO | null;
}) {
  const [preferences, setPreferences] = useState<UserPreferencesDTO | null>(initial);

  const optimisticPreferences = useCallback((patch: Partial<UserPreferencesDTO>) => {
    setPreferences((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const patchPreferences = useCallback(async (patch: Partial<UserPreferencesDTO>) => {
    let before: UserPreferencesDTO | null = null;
    setPreferences((p) => {
      before = p;
      return p ? { ...p, ...patch } : p;
    });
    try {
      const res = await fetch(publicApiUrl("/api/me/preferences"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        throw new Error("save failed");
      }
      const next = (await res.json()) as UserPreferencesDTO;
      setPreferences(next);
    } catch {
      setPreferences(before);
      throw new Error("Failed to save preferences");
    }
  }, []);

  const value = useMemo(
    () => ({
      preferences,
      setPreferences,
      patchPreferences,
      optimisticPreferences,
    }),
    [preferences, patchPreferences, optimisticPreferences]
  );

  return <UserPreferencesContext.Provider value={value}>{children}</UserPreferencesContext.Provider>;
}

export function useUserPreferences(): UserPreferencesContextValue {
  const ctx = useContext(UserPreferencesContext);
  if (!ctx) {
    throw new Error("useUserPreferences must be used within UserPreferencesProvider");
  }
  return ctx;
}

export function useUserPreferencesOptional(): UserPreferencesContextValue | null {
  return useContext(UserPreferencesContext);
}
