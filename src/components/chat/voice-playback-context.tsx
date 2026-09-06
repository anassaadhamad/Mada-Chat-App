"use client";

import { createContext, useCallback, useContext, useRef, type ReactNode } from "react";

type VoicePlaybackContextValue = {
  /** Pause any other voice, then register this instance as the active one. Call immediately before `play()`. */
  claim: (id: string, pauseThisInstance: () => void) => void;
  /** Call when this instance pauses, ends, or unmounts so the slot can be reclaimed. */
  release: (id: string) => void;
};

const VoicePlaybackContext = createContext<VoicePlaybackContextValue | null>(null);

export function VoicePlaybackProvider({ children }: { children: ReactNode }) {
  const activeIdRef = useRef<string | null>(null);
  const pauseActiveRef = useRef<(() => void) | null>(null);

  const claim = useCallback((id: string, pauseThisInstance: () => void) => {
    if (activeIdRef.current != null && activeIdRef.current !== id) {
      pauseActiveRef.current?.();
    }
    activeIdRef.current = id;
    pauseActiveRef.current = pauseThisInstance;
  }, []);

  const release = useCallback((id: string) => {
    if (activeIdRef.current === id) {
      activeIdRef.current = null;
      pauseActiveRef.current = null;
    }
  }, []);

  return (
    <VoicePlaybackContext.Provider value={{ claim, release }}>{children}</VoicePlaybackContext.Provider>
  );
}

export function useVoicePlayback(): VoicePlaybackContextValue {
  const ctx = useContext(VoicePlaybackContext);
  if (!ctx) {
    throw new Error("useVoicePlayback must be used within VoicePlaybackProvider");
  }
  return ctx;
}
