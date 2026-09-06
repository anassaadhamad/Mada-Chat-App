"use client";

import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MessageBubble } from "@/components/chat/message-bubble";
import { ChatSystemNoticeRow } from "@/components/chat/chat-system-notice-row";
import type { MediaLightboxPayload } from "@/components/chat/media-lightbox";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { formatChatDayLabel } from "@/lib/format-chat-day-label";
import type { ChatMessage, MessageReactionSummary } from "@/lib/chat-types";
import { optimisticToggleReaction } from "@/lib/message-reactions";
import { useI18n } from "@/components/i18n/i18n-provider";
import { useChatStore } from "@/stores/chat-store";

const MediaLightbox = dynamic(
  () => import("@/components/chat/media-lightbox").then((m) => m.MediaLightbox),
  { ssr: false, loading: () => null }
);

/** Distance from scroll top (px) at which we request the next older page. */
const SCROLL_LOAD_OLDER_PX = 120;

type MessageListProps = {
  conversationId: string;
  messages: ChatMessage[];
  currentUserId: string;
  peerLabel: string;
  peerReadAt?: number;
  /** When true, reactions, reply, and edit/delete actions are disabled for this thread. */
  interactionLocked?: boolean;
  onReply?: (message: ChatMessage) => void;
  /** When false, new messages do not auto-scroll the panel to the bottom (e.g. in-chat search open). */
  stickToBottomOnNewMessages?: boolean;
  highlightQuery?: string;
  /** Current search match — scrolls into view when present in the list. */
  activeSearchMessageId?: string | null;
  /** Load older pages when the user scrolls to the top (infinite history). */
  fetchOlderMessages?: () => Promise<boolean>;
  /** True while the server reports more rows before the oldest loaded message. */
  hasOlderMessages?: boolean;
  onEditMessage?: (message: ChatMessage) => void;
  onCancelAttachmentUpload?: (message: ChatMessage) => void;
  onRetryAttachmentUpload?: (message: ChatMessage) => void;
  catchUpMode?: boolean;
  catchUpSelectedIds?: ReadonlySet<string>;
  onCatchUpToggle?: (messageId: string) => void;
};

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function escapeSelectorValue(id: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(id);
  }
  return id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

type MessageListItemProps = {
  message: ChatMessage;
  showDay: boolean;
  dayBadgeText: string;
  currentUserId: string;
  peerLabel: string;
  peerReadAt?: number;
  interactionLocked: boolean;
  highlightQuery?: string;
  isSearchActive: boolean;
  isReplyFlash: boolean;
  onReply?: (message: ChatMessage) => void;
  onPickReaction?: (messageId: string, emoji: string) => void;
  onJumpToOriginal: (targetId: string) => void;
  onMediaLightbox: (payload: MediaLightboxPayload) => void;
  onEditMessage?: (message: ChatMessage) => void;
  onRequestDelete: (message: ChatMessage) => void;
  onCancelAttachmentUpload?: (message: ChatMessage) => void;
  onRetryAttachmentUpload?: (message: ChatMessage) => void;
  catchUpMode?: boolean;
  catchUpSelected?: boolean;
  onCatchUpToggle?: (messageId: string) => void;
};

/** One day row + bubble — memoized so parent list re-renders don't rebuild unchanged rows. */
const MessageListItem = memo(function MessageListItem({
  message: m,
  showDay,
  dayBadgeText,
  currentUserId,
  peerLabel,
  peerReadAt,
  interactionLocked,
  highlightQuery,
  isSearchActive,
  isReplyFlash,
  onReply,
  onPickReaction,
  onJumpToOriginal,
  onMediaLightbox,
  onEditMessage,
  onRequestDelete,
  onCancelAttachmentUpload,
  onRetryAttachmentUpload,
  catchUpMode = false,
  catchUpSelected = false,
  onCatchUpToggle,
}: MessageListItemProps) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {showDay ? (
        <div className="flex justify-center">
          <span className="bg-background/90 text-muted-foreground rounded-full px-3 py-1 text-[11px] font-medium shadow-sm backdrop-blur-sm">
            {dayBadgeText}
          </span>
        </div>
      ) : null}
      {m.systemNotice?.kind === "disappearing_timer" ? (
        <ChatSystemNoticeRow message={m} currentUserId={currentUserId} peerLabel={peerLabel} />
      ) : (
        <MessageBubble
          message={m}
          isOwn={m.senderId === currentUserId}
          showPeerLabel={m.senderId !== currentUserId ? peerLabel : undefined}
          peerReadAt={peerReadAt}
          onReply={onReply}
          replyQuoteLabel={peerLabel}
          onMediaLightbox={onMediaLightbox}
          highlightQuery={highlightQuery}
          isSearchActive={isSearchActive}
          currentUserId={currentUserId}
          peerLabel={peerLabel}
          onPickReaction={interactionLocked ? undefined : onPickReaction}
          onJumpToOriginal={onJumpToOriginal}
          isReplyFlash={isReplyFlash}
          onEdit={onEditMessage}
          onDelete={interactionLocked ? undefined : onRequestDelete}
          onCancelAttachmentUpload={onCancelAttachmentUpload}
          onRetryAttachmentUpload={onRetryAttachmentUpload}
          catchUpMode={catchUpMode}
          catchUpSelected={catchUpSelected}
          onCatchUpToggle={onCatchUpToggle}
        />
      )}
    </div>
  );
});

function MessageListInner({
  conversationId,
  messages,
  currentUserId,
  peerLabel,
  peerReadAt,
  interactionLocked = false,
  onReply,
  stickToBottomOnNewMessages = true,
  highlightQuery,
  activeSearchMessageId,
  fetchOlderMessages,
  hasOlderMessages = false,
  onEditMessage,
  onCancelAttachmentUpload,
  onRetryAttachmentUpload,
  catchUpMode = false,
  catchUpSelectedIds,
  onCatchUpToggle,
}: MessageListProps) {
  const { t, locale } = useI18n();
  const applyMessageReactions = useChatStore((s) => s.applyMessageReactions);
  const applyMessageUpdate = useChatStore((s) => s.applyMessageUpdate);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollRestoreRef = useRef<{ prevScrollHeight: number; prevScrollTop: number } | null>(null);
  const loadingOlderRef = useRef(false);
  const skipNextStickToBottomRef = useRef(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [flashMessageId, setFlashMessageId] = useState<string | null>(null);
  /** After the first bottom snap for this thread, new messages use smooth scroll. */
  const initialSnapDoneRef = useRef(false);
  const lastMessageId = messages.at(-1)?.id;
  const [lightbox, setLightbox] = useState<MediaLightboxPayload | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChatMessage | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const openLightbox = useCallback((payload: MediaLightboxPayload) => {
    setLightbox(payload);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightbox(null);
  }, []);

  const closeDeleteDialog = useCallback(() => {
    if (!deleteBusy) setDeleteTarget(null);
  }, [deleteBusy]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(deleteTarget.id)}`,
        { method: "DELETE" }
      );
      const data = (await res.json()) as { message?: ChatMessage };
      if (res.ok && data.message) {
        applyMessageUpdate(conversationId, data.message);
      }
    } finally {
      setDeleteBusy(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, conversationId, applyMessageUpdate]);

  useEffect(() => {
    if (!deleteTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !deleteBusy) setDeleteTarget(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteTarget, deleteBusy]);

  const onPickReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (messageId.startsWith("pending:")) return;
      const msgs = useChatStore.getState().messagesByConversationId[conversationId] ?? [];
      const msg = msgs.find((m) => m.id === messageId);
      const prevR = msg?.reactions;
      const next = optimisticToggleReaction(prevR, currentUserId, emoji);
      applyMessageReactions(conversationId, messageId, next);
      try {
        const res = await fetch(
          `/api/conversations/${conversationId}/messages/${encodeURIComponent(messageId)}/reactions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ emoji }),
          }
        );
        const data = (await res.json()) as { reactions?: MessageReactionSummary[]; error?: string };
        if (!res.ok) {
          applyMessageReactions(conversationId, messageId, prevR ?? []);
          return;
        }
        if (Array.isArray(data.reactions)) {
          applyMessageReactions(conversationId, messageId, data.reactions);
        }
      } catch {
        applyMessageReactions(conversationId, messageId, prevR ?? []);
      }
    },
    [conversationId, currentUserId, applyMessageReactions]
  );

  const jumpToOriginal = useCallback(
    async (targetId: string) => {
      let guard = 0;
      while (
        guard < 48 &&
        !(useChatStore.getState().messagesByConversationId[conversationId] ?? []).some(
          (m) => m.id === targetId
        )
      ) {
        if (!fetchOlderMessages) break;
        const more = await fetchOlderMessages();
        if (!more) break;
        guard++;
      }
      setFlashMessageId(targetId);
    },
    [conversationId, fetchOlderMessages]
  );

  const tryLoadOlder = useCallback(async () => {
    if (!fetchOlderMessages || !hasOlderMessages) return;
    if (loadingOlderRef.current) return;
    const el = scrollRef.current;
    if (!el || el.scrollTop > SCROLL_LOAD_OLDER_PX) return;

    skipNextStickToBottomRef.current = true;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    scrollRestoreRef.current = { prevScrollHeight: el.scrollHeight, prevScrollTop: el.scrollTop };
    let loaded = false;
    try {
      loaded = await fetchOlderMessages();
    } finally {
      if (!loaded) {
        scrollRestoreRef.current = null;
        skipNextStickToBottomRef.current = false;
      }
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [fetchOlderMessages, hasOlderMessages]);

  const onRequestDelete = useCallback((msg: ChatMessage) => {
    setDeleteTarget(msg);
  }, []);

  useEffect(() => {
    if (!flashMessageId) return;
    const timer = setTimeout(() => setFlashMessageId(null), 1700);
    return () => clearTimeout(timer);
  }, [flashMessageId]);

  useLayoutEffect(() => {
    if (!flashMessageId || !scrollRef.current) return;
    const sel = `[data-message-id="${escapeSelectorValue(flashMessageId)}"]`;
    const el = scrollRef.current.querySelector(sel);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [flashMessageId, messages]);

  useLayoutEffect(() => {
    initialSnapDoneRef.current = false;
    scrollRestoreRef.current = null;
    loadingOlderRef.current = false;
    skipNextStickToBottomRef.current = false;
    queueMicrotask(() => setLoadingOlder(false));
  }, [conversationId]);

  useLayoutEffect(() => {
    const pending = scrollRestoreRef.current;
    const el = scrollRef.current;
    if (!pending || !el) return;
    scrollRestoreRef.current = null;
    const delta = el.scrollHeight - pending.prevScrollHeight;
    el.scrollTop = pending.prevScrollTop + delta;
  }, [messages]);

  const scrollPanelToBottom = useCallback(
    (behavior: "auto" | "smooth") => {
      const el = scrollRef.current;
      if (!el || messages.length === 0) return;
      if (behavior === "smooth") {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      } else {
        el.scrollTop = el.scrollHeight;
      }
    },
    [messages.length]
  );

  useLayoutEffect(() => {
    if (skipNextStickToBottomRef.current) {
      skipNextStickToBottomRef.current = false;
      return;
    }
    if (!stickToBottomOnNewMessages || messages.length === 0) return;
    const useSmooth = initialSnapDoneRef.current;
    initialSnapDoneRef.current = true;

    const run = () => {
      scrollPanelToBottom(useSmooth ? "smooth" : "auto");
    };

    run();
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
    return () => cancelAnimationFrame(id);
  }, [
    conversationId,
    messages.length,
    lastMessageId,
    stickToBottomOnNewMessages,
    scrollPanelToBottom,
  ]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !fetchOlderMessages || !hasOlderMessages) return;
    const onScroll = () => {
      void tryLoadOlder();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [conversationId, fetchOlderMessages, hasOlderMessages, tryLoadOlder]);

  /** When the thread pane gains height (e.g. mobile list → thread), or content grows while already at the bottom. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let prevH = el.clientHeight;

    const ro = new ResizeObserver(() => {
      if (!stickToBottomOnNewMessages) return;
      const node = scrollRef.current;
      if (!node || messages.length === 0) return;

      const h = node.clientHeight;
      const scrollH = node.scrollHeight;
      const maxScroll = Math.max(0, scrollH - h);

      if (h === 0) {
        prevH = 0;
        return;
      }

      const becameVisible = prevH === 0 && h > 0;
      const distanceFromBottom = maxScroll - node.scrollTop;
      const nearBottom = distanceFromBottom < 120;

      if (becameVisible || (nearBottom && maxScroll > 0)) {
        node.scrollTop = scrollH;
      }

      prevH = h;
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [conversationId, messages.length, stickToBottomOnNewMessages]);

  useLayoutEffect(() => {
    if (!activeSearchMessageId || !scrollRef.current) return;
    const sel = `[data-message-id="${escapeSelectorValue(activeSearchMessageId)}"]`;
    const el = scrollRef.current.querySelector(sel);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeSearchMessageId, messages]);

  let lastDay = "";

  return (
    <div
      ref={scrollRef}
      className="chat-panel-bg flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-2 py-3 md:px-4 xl:px-6"
    >
      {loadingOlder ? (
        <div
          className="border-chat-header-border/60 text-muted-foreground flex min-h-10 shrink-0 items-center justify-center gap-2 border-b py-2 text-xs"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
          <span>{t("messageList.loadingOlder")}</span>
        </div>
      ) : null}
      {deleteTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-message-title"
          aria-describedby="delete-message-desc"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeDeleteDialog();
          }}
        >
          <div
            className="bg-card w-full max-w-sm rounded-xl border p-4 shadow-lg"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id="delete-message-title" className="text-base font-semibold">
              {t("messageDelete.confirmTitle")}
            </h2>
            <p id="delete-message-desc" className="text-muted-foreground mt-2 text-sm">
              {t("messageDelete.confirmBody")}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={deleteBusy} onClick={closeDeleteDialog}>
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deleteBusy}
                onClick={() => void confirmDelete()}
              >
                {t("messageDelete.confirmAction")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <MediaLightbox open={!!lightbox} payload={lightbox} onClose={closeLightbox} />
      <div className="chat-thread-content-width flex flex-col gap-3">
        {messages.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">{t("messageList.empty")}</p>
        ) : (
          messages.map((m) => {
            const dk = dayKey(m.createdAt);
            const showDay = dk !== lastDay;
            if (showDay) lastDay = dk;
            return (
              <MessageListItem
                key={m.id}
                message={m}
                showDay={showDay}
                dayBadgeText={formatChatDayLabel(m.createdAt, locale, t)}
                currentUserId={currentUserId}
                peerLabel={peerLabel}
                peerReadAt={peerReadAt}
                interactionLocked={interactionLocked}
                highlightQuery={highlightQuery}
                isSearchActive={activeSearchMessageId === m.id}
                isReplyFlash={flashMessageId === m.id}
                onReply={onReply}
                onPickReaction={onPickReaction}
                onJumpToOriginal={jumpToOriginal}
                onMediaLightbox={openLightbox}
                onEditMessage={onEditMessage}
                onRequestDelete={onRequestDelete}
                onCancelAttachmentUpload={onCancelAttachmentUpload}
                onRetryAttachmentUpload={onRetryAttachmentUpload}
                catchUpMode={catchUpMode}
                catchUpSelected={!!catchUpSelectedIds?.has(m.id)}
                onCatchUpToggle={onCatchUpToggle}
              />
            );
          })
        )}
        <div className="h-px shrink-0" aria-hidden />
      </div>
    </div>
  );
}

export const MessageList = memo(MessageListInner);
