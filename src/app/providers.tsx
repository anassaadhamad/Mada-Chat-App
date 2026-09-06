"use client";

import type { ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import { VoicePlaybackProvider } from "@/components/chat/voice-playback-context";
import { PwaRegister } from "@/components/pwa/pwa-register";
import { DeferredAppProviders } from "@/components/preferences/deferred-app-providers";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <PwaRegister />
      <VoicePlaybackProvider>
        <DeferredAppProviders>{children}</DeferredAppProviders>
      </VoicePlaybackProvider>
    </SessionProvider>
  );
}
