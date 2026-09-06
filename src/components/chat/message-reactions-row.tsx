"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { MessageReactionSummary } from "@/lib/chat-types";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n/i18n-provider";

type MessageReactionsRowProps = {
  summaries: MessageReactionSummary[];
  isOwn: boolean;
  currentUserId: string;
  peerLabel: string;
};

export function MessageReactionsRow({ summaries, isOwn, currentUserId, peerLabel }: MessageReactionsRowProps) {
  const { t } = useI18n();
  const [openEmoji, setOpenEmoji] = useState<string | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openEmoji) return;
    const onDoc = (e: MouseEvent) => {
      if (rowRef.current?.contains(e.target as Node)) return;
      setOpenEmoji(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openEmoji]);

  if (!summaries.length) return null;

  const labelFor = (userId: string) => (userId === currentUserId ? t("common.you") : peerLabel);

  return (
    <div
      ref={rowRef}
      className={cn(
        "pointer-events-auto relative z-10 -mt-1 flex max-w-[min(100%,16rem)] flex-wrap gap-1",
        isOwn ? "justify-end self-end" : "justify-start self-start"
      )}
    >
      {summaries.map(({ emoji, userIds }) => {
        const count = userIds.length;
        const detailOpen = openEmoji === emoji;
        return (
          <motion.div key={emoji} layout className="relative" initial={false}>
            <motion.button
              type="button"
              layout
              initial={{ scale: 0.82, opacity: 0.85 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 420, damping: 24 }}
              className={cn(
                "border-border/80 bg-background/90 text-foreground inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs shadow-sm backdrop-blur-sm transition-transform hover:scale-105",
                detailOpen ? "ring-ring ring-2" : ""
              )}
              onClick={(e) => {
                e.stopPropagation();
                setOpenEmoji((v) => (v === emoji ? null : emoji));
              }}
              aria-expanded={detailOpen}
              aria-label={t("messageReactions.summaryAria", { emoji })}
            >
              <span className="text-base leading-none">{emoji}</span>
              {count > 1 ? <span className="text-muted-foreground tabular-nums">{count}</span> : null}
            </motion.button>
            <AnimatePresence>
              {detailOpen ? (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  className={cn(
                    "border-border bg-popover text-popover-foreground absolute bottom-full z-40 mb-1 min-w-[8.5rem] rounded-lg border px-2 py-1.5 text-start text-xs shadow-md",
                    isOwn ? "end-0" : "start-0"
                  )}
                  role="tooltip"
                >
                  <p className="text-muted-foreground mb-1 text-[10px] font-medium tracking-wide uppercase">
                    {t("messageReactions.who")}
                  </p>
                  <ul className="space-y-0.5">
                    {userIds.map((uid) => (
                      <li key={`${emoji}-${uid}`} className="flex items-center gap-1.5">
                        <span className="text-base leading-none">{emoji}</span>
                        <span className="truncate">{labelFor(uid)}</span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}
