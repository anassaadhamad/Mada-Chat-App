"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const BAR_COUNT = 24;

type RecordingVisualizerProps = {
  stream: MediaStream | null;
  className?: string;
};

/**
 * Live frequency bars while recording (proves the mic is live).
 */
export function RecordingVisualizer({ stream, className }: RecordingVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    if (!stream) return;

    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.65;
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    audioCtxRef.current = audioCtx;
    analyserRef.current = analyser;
    dataRef.current = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      const an = analyserRef.current;
      const data = dataRef.current;
      const c = canvasRef.current;
      if (!an || !data || !c) return;

      an.getByteFrequencyData(data as Parameters<AnalyserNode["getByteFrequencyData"]>[0]);
      const dpr = window.devicePixelRatio || 1;
      const rect = c.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      if (c.width !== w * dpr || c.height !== h * dpr) {
        c.width = w * dpr;
        c.height = h * dpr;
      }
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const step = Math.max(1, Math.floor(data.length / BAR_COUNT));
      const gap = 2;
      const barW = (w - gap * (BAR_COUNT - 1)) / BAR_COUNT;
      const mid = h / 2;

      for (let i = 0; i < BAR_COUNT; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) {
          sum += data[i * step + j] ?? 0;
        }
        const avg = sum / step / 255;
        const bh = Math.max(2, avg * (h * 0.85));
        const x = i * (barW + gap);
        const grd = ctx.createLinearGradient(0, mid - bh / 2, 0, mid + bh / 2);
        grd.addColorStop(0, "rgba(239,68,68,0.95)");
        grd.addColorStop(1, "rgba(248,113,113,0.45)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(x, mid - bh / 2, barW, bh, 2);
        } else {
          ctx.rect(x, mid - bh / 2, barW, bh);
        }
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    void audioCtx.resume().then(() => {
      rafRef.current = requestAnimationFrame(draw);
    });

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      source.disconnect();
      void audioCtx.close();
      audioCtxRef.current = null;
      analyserRef.current = null;
      dataRef.current = null;
    };
  }, [stream]);

  if (!stream) return null;

  return (
    <canvas
      ref={canvasRef}
      className={cn("h-10 w-full max-w-[200px]", className)}
      aria-hidden
    />
  );
}
