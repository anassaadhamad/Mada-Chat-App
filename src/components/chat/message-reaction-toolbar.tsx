"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { CornerUpLeft, Pencil, Trash2 } from "lucide-react";
import { MESSAGE_REACTION_EMOJIS } from "@/lib/message-reactions";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n/i18n-provider";
import { playReplySound } from "@/lib/ui-sounds";

const HOVER_SHOW_MS = 260;
const HOVER_HIDE_MS = 140;
const LONG_PRESS_MS = 480;

type MessageReactionToolbarShellProps = {
  children: ReactNode;
  /** When true, hover / long-press does not open the bar. */
  disabled?: boolean;
  isOwn: boolean;
  onPick?: (emoji: string) => void;
  /** Reply action (same discoverability as reactions: hover on desktop, long-press on touch). */
  onReply?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  suppress?: boolean;
};

export function MessageReactionToolbarShell({
  children,
  disabled,
  isOwn,
  onPick,
  onReply,
  onEdit,
  onDelete,
  suppress,
}: MessageReactionToolbarShellProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [prefersHover, setPrefersHover] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasReactions = !!onPick;
  const hasReply = !!onReply;
  const hasEdit = !!onEdit;
  const hasDelete = !!onDelete;
  const canOpen = hasReactions || hasReply || hasEdit || hasDelete;

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover)");
    const sync = () => setPrefersHover(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const clearTimers = useCallback(() => {
    if (showTimer.current) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const scheduleShow = useCallback(() => {
    if (disabled || suppress || !canOpen) return;
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (showTimer.current) clearTimeout(showTimer.current);
    showTimer.current = setTimeout(() => {
      showTimer.current = null;
      setOpen(true);
    }, HOVER_SHOW_MS);
  }, [disabled, suppress, canOpen]);

  const scheduleHide = useCallback(() => {
    if (showTimer.current) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      hideTimer.current = null;
      setOpen(false);
    }, HOVER_HIDE_MS);
  }, []);

  const cancelHide = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = e.target;
      if (el instanceof Node && (el as HTMLElement).closest?.("[data-reaction-toolbar-root]")) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const onPointerDown = useCallback(() => {
    if (disabled || suppress || !canOpen) return;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      setOpen(true);
    }, LONG_PRESS_MS);
  }, [disabled, suppress, canOpen]);

  const onPointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const onEmojiClick = useCallback(
    (emoji: string) => {
      if (!onPick) return;
      onPick(emoji);
      setOpen(false);
      clearTimers();
    },
    [onPick, clearTimers]
  );

  return (
    <div
      data-reaction-toolbar-root
      className="relative"
      onMouseEnter={() => {
        if (!prefersHover || suppress || disabled || !canOpen) return;
        scheduleShow();
      }}
      onMouseLeave={() => {
        if (!prefersHover) return;
        scheduleHide();
      }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => {
        if (open) e.preventDefault();
      }}
    >
      {open ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.88 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 520, damping: 32, mass: 0.65 }}
          className={cn(
            "absolute bottom-full z-30 mb-1 flex items-center gap-0.5 rounded-full border border-black/10 bg-background/95 px-1.5 py-1 shadow-lg backdrop-blur-md dark:border-white/15 dark:bg-zinc-900/95",
            isOwn ? "end-0" : "start-0"
          )}
          onMouseEnter={cancelHide}
          onMouseLeave={() => {
            if (prefersHover) scheduleHide();
          }}
        >
          {onReply ? (
            <>
              <button
                type="button"
                className="text-foreground hover:bg-muted/90 flex size-9 items-center justify-center rounded-full transition-colors active:scale-95"
                aria-label={t("messageReply.toolbarReplyAria")}
                onClick={(e) => {
                  e.stopPropagation();
                  playReplySound();
                  onReply?.();
                  setOpen(false);
                  clearTimers();
                }}
              >
                <CornerUpLeft className="size-4" />
              </button>
              {hasReactions ? (
                <span className="bg-border mx-0.5 h-6 w-px shrink-0 self-stretch opacity-80" aria-hidden />
              ) : null}
            </>
          ) : null}
          {hasReactions
            ? MESSAGE_REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="flex size-9 items-center justify-center rounded-full text-lg transition-colors hover:bg-muted/90 active:scale-95"
                  aria-label={emoji}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEmojiClick(emoji);
                  }}
                >
                  <span className="leading-none">{emoji}</span>
                </button>
              ))
            : null}
          {hasEdit || hasDelete ? (
            <span className="bg-border mx-0.5 h-6 w-px shrink-0 self-stretch opacity-80" aria-hidden />
          ) : null}
          {onEdit ? (
            <button
              type="button"
              className="text-foreground hover:bg-muted/90 flex size-9 items-center justify-center rounded-full transition-colors active:scale-95"
              aria-label={t("messageActions.editAria")}
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
                setOpen(false);
                clearTimers();
              }}
            >
              <Pencil className="size-4" />
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              className="text-destructive hover:bg-destructive/15 flex size-9 items-center justify-center rounded-full transition-colors active:scale-95"
              aria-label={t("messageActions.deleteAria")}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
                setOpen(false);
                clearTimers();
              }}
            >
              <Trash2 className="size-4" />
            </button>
          ) : null}
        </motion.div>
      ) : null}
      {children}
    </div>
  );
}
