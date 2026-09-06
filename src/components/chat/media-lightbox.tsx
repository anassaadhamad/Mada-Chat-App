"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type MediaLightboxPayload = {
  src: string;
  kind: "image" | "video";
  fileName: string;
};

type MediaLightboxProps = {
  open: boolean;
  payload: MediaLightboxPayload | null;
  onClose: () => void;
};

const glassBtn =
  "rounded-full border border-white/25 bg-white/15 px-3 py-2 text-white shadow-lg backdrop-blur-md transition-colors hover:bg-white/25";

function LightboxVideoPanel({ src, open }: { src: string; open: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    if (!open) {
      const v = videoRef.current;
      if (v) {
        v.pause();
        v.currentTime = 0;
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const v = videoRef.current;
    if (!v) return;
    void v.play().catch(() => {
      /* autoplay policies */
    });
  }, [open, src]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.muted = muted;
  }, [muted]);

  return (
    <div className="relative w-full max-w-4xl overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/10">
      <video
        ref={videoRef}
        src={src}
        className="max-h-[min(78vh,800px)] w-full bg-black object-contain"
        controls
        playsInline
        muted={muted}
        loop={false}
      />
      <div className="absolute bottom-4 start-1/2 z-10 flex -translate-x-1/2 gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="border-white/30 bg-white/15 text-white backdrop-blur-md hover:bg-white/25"
          onClick={() => setMuted((m) => !m)}
        >
          {muted ? (
            <>
              <VolumeX className="me-1 size-4" /> Unmute
            </>
          ) : (
            <>
              <Volume2 className="me-1 size-4" /> Mute
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export function MediaLightbox({ open, payload, onClose }: MediaLightboxProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleDownload = useCallback(() => {
    if (!payload) return;
    const a = document.createElement("a");
    a.href = payload.src;
    a.download = payload.fileName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [payload]);

  return (
    <AnimatePresence>
      {open && payload ? (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 md:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Media viewer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.button
            type="button"
            className="absolute inset-0 bg-black/55 backdrop-blur-xl"
            aria-label="Close gallery"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="relative z-10 flex max-h-[min(92vh,920px)] w-full max-w-5xl flex-col items-center justify-center"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-2 end-2 z-20 flex items-center gap-2">
              <button type="button" className={glassBtn} onClick={handleDownload} title="Download">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Download className="size-4" aria-hidden />
                  <span className="hidden sm:inline">Download</span>
                </span>
              </button>
              <button type="button" className={cn(glassBtn, "p-2")} onClick={onClose} aria-label="Close">
                <X className="size-5" />
              </button>
            </div>

            {payload.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={payload.src}
                alt={payload.fileName}
                className="max-h-[min(85vh,880px)] w-auto max-w-full rounded-lg object-contain shadow-2xl ring-1 ring-white/10"
              />
            ) : (
              <LightboxVideoPanel key={payload.src} src={payload.src} open={open} />
            )}
            <p className="text-muted-foreground mt-3 max-w-full truncate px-2 text-center text-xs text-white/80">
              {payload.fileName}
            </p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
