"use client";

import WaveSurfer from "wavesurfer.js";
import { startTransition, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Gauge, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n/i18n-provider";
import { useVoicePlayback } from "@/components/chat/voice-playback-context";

const SPEEDS = [1, 1.5, 2] as const;

function formatVoiceTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export type VoiceNotePlayerProps = {
  src: string;
  isOwn: boolean;
  /** Unique id for singleton playback (e.g. message id or `voice-draft-preview`). */
  playbackId: string;
  showSendingOverlay?: boolean;
  /** When set with `showSendingOverlay`, replaces the default spinner (e.g. upload progress). */
  uploadOverlay?: ReactNode;
  className?: string;
};

export function VoiceNotePlayer({
  src,
  isOwn,
  playbackId,
  showSendingOverlay,
  uploadOverlay,
  className,
}: VoiceNotePlayerProps) {
  const { t } = useI18n();
  const { claim, release } = useVoicePlayback();
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [loadError, setLoadError] = useState(false);

  const waveUnplayed = isOwn ? "rgba(255,255,255,0.34)" : "rgba(120,120,120,0.42)";
  const wavePlayed = isOwn ? "rgba(255,255,255,0.96)" : "rgb(16, 185, 129)";

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ws = WaveSurfer.create({
      container: el,
      height: 44,
      waveColor: waveUnplayed,
      progressColor: wavePlayed,
      cursorWidth: 0,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      interact: true,
      dragToSeek: { debounceTime: 60 },
      backend: "MediaElement",
      audioRate: 1,
    });

    wsRef.current = ws;
    startTransition(() => {
      setReady(false);
      setLoadError(false);
      setDuration(0);
      setCurrent(0);
      setPlaying(false);
      setSpeedIdx(0);
    });

    const onReady = (d: number) => {
      setDuration(d);
      setReady(true);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => {
      setPlaying(false);
      release(playbackId);
    };
    const onFinish = () => {
      setPlaying(false);
      release(playbackId);
    };
    const onTime = (time: number) => setCurrent(time);
    const onError = () => setLoadError(true);

    ws.on("ready", onReady);
    ws.on("play", onPlay);
    ws.on("pause", onPause);
    ws.on("finish", onFinish);
    ws.on("timeupdate", onTime);
    ws.on("error", onError);

    void ws.load(src).catch(() => setLoadError(true));

    return () => {
      release(playbackId);
      ws.un("ready", onReady);
      ws.un("play", onPlay);
      ws.un("pause", onPause);
      ws.un("finish", onFinish);
      ws.un("timeupdate", onTime);
      ws.un("error", onError);
      ws.destroy();
      wsRef.current = null;
    };
  }, [src, playbackId, release, wavePlayed, waveUnplayed]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;
    ws.toggleInteraction(!showSendingOverlay);
  }, [showSendingOverlay, ready]);

  const togglePlay = useCallback(async () => {
    const ws = wsRef.current;
    if (!ws || !ready || showSendingOverlay || loadError) return;
    if (ws.isPlaying()) {
      ws.pause();
      return;
    }
    claim(playbackId, () => {
      ws.pause();
    });
    try {
      await ws.play();
    } catch {
      setLoadError(true);
    }
  }, [claim, loadError, playbackId, ready, showSendingOverlay]);

  const cycleSpeed = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || !ready) return;
    const nextIdx = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(nextIdx);
    const rate = SPEEDS[nextIdx]!;
    ws.setPlaybackRate(rate, true);
  }, [ready, speedIdx]);

  return (
    <div className={cn("relative w-full min-w-[200px] max-w-[min(100%,18rem)]", className)}>
      <div
        className={cn(
          "flex items-center gap-2 rounded-2xl px-2 py-2",
          isOwn ? "bg-black/20" : "bg-black/[0.06] dark:bg-white/[0.08]"
        )}
      >
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className={cn(
            "size-10 shrink-0 rounded-full shadow-sm",
            isOwn && "border-white/20 bg-white/95 text-emerald-700 hover:bg-white"
          )}
          onClick={() => void togglePlay()}
          disabled={!ready || showSendingOverlay || loadError}
          aria-label={playing ? t("voice.pause") : t("voice.play")}
        >
          {playing ? <Pause className="size-4" /> : <Play className="ms-0.5 size-4" />}
        </Button>

        <div className="min-w-0 flex-1">
          <div ref={containerRef} aria-label={t("voice.waveformAria")} />
          <div
            className={cn(
              "mt-0.5 flex items-center justify-between gap-2 px-0.5 font-variant-numeric tabular-nums text-[10px]",
              isOwn ? "text-chat-out-foreground/80" : "text-muted-foreground"
            )}
          >
            <span>
              {formatVoiceTime(current)} / {loadError ? "—" : formatVoiceTime(duration)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 gap-1 px-2 text-[10px] font-semibold",
                isOwn ? "text-chat-out-foreground hover:bg-white/15" : ""
              )}
              onClick={cycleSpeed}
              disabled={!ready || showSendingOverlay || loadError}
              aria-label={t("voice.speedAria")}
            >
              <Gauge className="size-3.5" />
              {SPEEDS[speedIdx]}×
            </Button>
          </div>
        </div>
      </div>

      {showSendingOverlay ? (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/40 backdrop-blur-[1px]">
          {uploadOverlay ?? (
            <span
              className="size-8 animate-spin rounded-full border-2 border-white/50 border-t-white"
              aria-hidden
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
