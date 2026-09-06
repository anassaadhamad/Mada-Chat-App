"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n/i18n-provider";
import { publicApiUrl } from "@/lib/env-public";
import { cn } from "@/lib/utils";

type CallMode = "voice" | "video";

type CallContainerProps = {
  conversationId: string;
  mode: CallMode;
  onClose: () => void;
};

type Phase = "consent" | "connecting" | "incall";

function getUserMediaGuidance(t: (key: string) => string, err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
        return t("call.permissionDenied");
      case "NotFoundError":
      case "OverconstrainedError":
        return t("call.noDeviceFound");
      case "NotReadableError":
        return t("call.hardwareBusy");
      case "AbortError":
        return t("call.permissionDismissed");
      case "SecurityError":
        return t("call.mediaNotSupported");
      default:
        break;
    }
  }
  return t("call.setupFailed");
}

/**
 * Full-screen Zego UIKit prebuilt overlay for 1:1 voice/video (room = conversation).
 * Requests mic/camera in a click handler before joining so mobile browsers grant
 * permissions reliably and Zego’s prebuilt “equipment authorization” step stays off.
 * When `conversationId` or `mode` changes, remount this component (e.g. `key` on the parent) so state resets cleanly.
 */
export function CallContainer({ conversationId, mode, onClose }: CallContainerProps) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<{ destroy: () => void } | null>(null);
  const onCloseRef = useRef(onClose);
  const aliveRef = useRef(true);
  const joiningRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("consent");
  const [guidance, setGuidance] = useState<string | null>(null);

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      try {
        engineRef.current?.destroy();
      } catch {
        /* ignore */
      }
      engineRef.current = null;
    };
  }, []);

  const startCall = useCallback(async () => {
    if (joiningRef.current) return;
    joiningRef.current = true;
    setGuidance(null);
    setPhase("connecting");

    const stopStream = (stream: MediaStream | null) => {
      if (!stream) return;
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      }
    };

    let primedStream: MediaStream | null = null;

    try {
      if (typeof window === "undefined" || !aliveRef.current) {
        setPhase("consent");
        return;
      }

      if (!window.isSecureContext) {
        setGuidance(t("call.secureContextRequired"));
        setPhase("consent");
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setGuidance(t("call.mediaNotSupported"));
        setPhase("consent");
        return;
      }

      const constraints: MediaStreamConstraints =
        mode === "video" ? { audio: true, video: true } : { audio: true, video: false };

      try {
        primedStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (e) {
        setGuidance(getUserMediaGuidance(t, e));
        setPhase("consent");
        return;
      }

      if (!aliveRef.current) {
        stopStream(primedStream);
        return;
      }

      stopStream(primedStream);
      primedStream = null;

      const res = await fetch(publicApiUrl("/api/calls/zego-token"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ conversationId }),
      });

      if (!aliveRef.current) return;

      if (!res.ok) {
        setGuidance(t("call.setupFailed"));
        setPhase("consent");
        return;
      }

      const data = (await res.json()) as { kitToken?: string };
      const kitToken = data.kitToken;
      if (!kitToken || typeof kitToken !== "string") {
        setGuidance(t("call.setupFailed"));
        setPhase("consent");
        return;
      }

      if (!aliveRef.current) return;

      const host = hostRef.current;
      if (!host) {
        setGuidance(t("call.setupFailed"));
        setPhase("consent");
        return;
      }

      const { ZegoUIKitPrebuilt } = await import("@zegocloud/zego-uikit-prebuilt");
      const zp = ZegoUIKitPrebuilt.create(kitToken);
      engineRef.current = zp;

      zp.joinRoom({
        container: host,
        maxUsers: 2,
        scenario: {
          mode: ZegoUIKitPrebuilt.OneONoneCall,
          config: { role: ZegoUIKitPrebuilt.Host },
        },
        turnOnCameraWhenJoining: mode === "video",
        turnOnMicrophoneWhenJoining: true,
        showPreJoinView: false,
        showMyCameraToggleButton: true,
        showMyMicrophoneToggleButton: true,
        showAudioVideoSettingsButton: false,
        showTextChat: false,
        showUserList: false,
        showScreenSharingButton: false,
        showLayoutButton: false,
        showRoomDetailsButton: false,
        onLeaveRoom: () => {
          onCloseRef.current();
        },
      });

      if (aliveRef.current) {
        setPhase("incall");
      }
    } catch {
      if (aliveRef.current) {
        setGuidance(t("call.setupFailed"));
        setPhase("consent");
      }
      try {
        engineRef.current?.destroy();
      } catch {
        /* ignore */
      }
      engineRef.current = null;
    } finally {
      joiningRef.current = false;
      stopStream(primedStream);
    }
  }, [conversationId, mode, t]);

  const showConsentOverlay = phase === "consent" || phase === "connecting";
  const prepareBody =
    mode === "video" ? t("call.prepareBodyVideo") : t("call.prepareBodyVoice");

  return (
    <div
      className={cn(
        "fixed inset-0 z-[220] flex flex-col bg-slate-950/95 text-white backdrop-blur-md",
        "supports-[height:100dvh]:min-h-[100dvh] min-h-screen"
      )}
      role="dialog"
      aria-modal
      aria-label={mode === "video" ? t("call.videoAria") : t("call.voiceAria")}
    >
      <div className="flex shrink-0 items-center justify-end gap-2 border-b border-white/10 px-3 py-2">
        <span className="text-white/50 me-auto text-xs tracking-wide uppercase">Mada</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10"
          aria-label={t("call.closeOverlayAria")}
          onClick={() => {
            try {
              engineRef.current?.destroy();
            } catch {
              /* ignore */
            }
            engineRef.current = null;
            onClose();
          }}
        >
          <X className="size-5" />
        </Button>
      </div>

      <div className="relative min-h-0 flex-1 w-full overflow-hidden">
        {showConsentOverlay && (
          <div
            className={cn(
              "absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 p-6 text-center",
              "bg-slate-950/90"
            )}
            aria-live="polite"
          >
            <div className="max-w-md space-y-3">
              {phase === "connecting" ? (
                <p className="text-base text-white/90">{t("call.connecting")}</p>
              ) : (
                <>
                  <h2 className="text-lg font-semibold text-white">{t("call.prepareTitle")}</h2>
                  <p className="text-sm leading-relaxed text-white/80">{prepareBody}</p>
                  {guidance ? <p className="text-sm text-destructive">{guidance}</p> : null}
                </>
              )}
            </div>
            {phase !== "connecting" ? (
              <Button
                type="button"
                className="min-w-[12rem]"
                onClick={() => void startCall()}
              >
                {guidance ? t("call.tryAgain") : t("call.allowAndContinue")}
              </Button>
            ) : null}
          </div>
        )}

        <div ref={hostRef} className="relative h-full min-h-0 w-full overflow-hidden" />
      </div>
    </div>
  );
}
