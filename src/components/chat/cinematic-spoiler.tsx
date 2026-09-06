"use client";

import { useCallback, useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { playSpoilerReveal } from "@/lib/ui-sounds";
import { useI18n } from "@/components/i18n/i18n-provider";

type CinematicSpoilerProps = {
  children: React.ReactNode;
  /** Matches chat bubble tone for overlay / vignette. */
  variant?: "own" | "peer";
  className?: string;
  /** Stable paragraph direction for spoiler text (avoids `dir="auto"` reflow when the shroud unmounts). */
  contentDir: "ltr" | "rtl";
};

export function CinematicSpoiler({
  children,
  variant = "peer",
  className,
  contentDir,
}: CinematicSpoilerProps) {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();
  const contentId = useId();
  const [revealed, setRevealed] = useState(false);

  const reveal = useCallback(() => {
    playSpoilerReveal();
    setRevealed(true);
  }, []);

  const ease = [0.19, 1, 0.22, 1] as const;
  const blurMs = reduceMotion ? 0.08 : 0.72;
  const shroudMs = reduceMotion ? 0.06 : 0.5;

  const overlayTint =
    variant === "own"
      ? "from-black/55 via-emerald-950/35 to-black/60"
      : "from-black/50 via-zinc-900/40 to-black/55";

  return (
    <span
      className={cn(
        "relative isolate inline-grid max-w-full align-baseline rounded-md",
        "min-h-[1.15em] min-w-[2.5rem] [grid-template-areas:'stack']",
        className
      )}
    >
      <motion.span
        id={contentId}
        dir={contentDir}
        className={cn(
          "cinematic-spoiler-inner [unicode-bidi:embed]",
          "[grid-area:stack] relative z-0 min-w-0 place-self-stretch",
          "block overflow-hidden rounded-[inherit]"
        )}
        aria-hidden={!revealed ? true : undefined}
        animate={{
          filter: revealed ? "blur(0px) brightness(1)" : "blur(18px) brightness(0.52)",
        }}
        transition={{
          filter: { duration: blurMs, ease },
        }}
        style={{ willChange: revealed ? "auto" : "filter" }}
      >
        {children}
      </motion.span>

      <AnimatePresence initial={false}>
        {!revealed ? (
          <motion.button
            key="cinematic-spoiler-shroud"
            type="button"
            dir="ltr"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: shroudMs, ease }}
            aria-expanded={false}
            aria-controls={contentId}
            aria-label={t("messageBubble.spoilerRevealAria")}
            className={cn(
              "[grid-area:stack] z-10 flex min-h-full min-w-full cursor-pointer place-self-stretch rounded-[inherit]",
              "border border-white/10 bg-black/55 bg-gradient-to-br shadow-[inset_0_0_48px_rgba(0,0,0,0.45)]",
              "backdrop-blur-[2px] focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none",
              overlayTint
            )}
            onClick={reveal}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                reveal();
              }
            }}
          >
            <span
              className={cn(
                "pointer-events-none flex min-h-full min-w-full items-center justify-center px-3 py-2",
                "text-[11px] font-semibold tracking-[0.2em] text-white/90 uppercase",
                "drop-shadow-[0_2px_12px_rgba(0,0,0,0.75)]"
              )}
              aria-hidden
            >
              {t("messageBubble.spoilerRevealTap")}
            </span>
          </motion.button>
        ) : null}
      </AnimatePresence>
    </span>
  );
}
