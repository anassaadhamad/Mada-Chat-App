"use client";

import { memo, useEffect, useRef, useState } from "react";
import { CheckCheck, CornerUpLeft, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatChatTime } from "@/lib/format-chat-time";
import { TwemojiText } from "@/components/chat/twemoji-text";
import { ChatMessageBody } from "@/components/chat/chat-message-body";
import { ChatMediaAttachment } from "@/components/chat/chat-media-attachment";
import type { MediaLightboxPayload } from "@/components/chat/media-lightbox";
import { isReadByPeer } from "@/lib/read-receipt";
import type { ChatMessage, MessageStatus } from "@/lib/chat-types";
import { useI18n } from "@/components/i18n/i18n-provider";
import { MessageReactionToolbarShell } from "@/components/chat/message-reaction-toolbar";
import { MessageReactionsRow } from "@/components/chat/message-reactions-row";
import { LinkPreview } from "@/components/chat/link-preview";
import { extractFirstHttpUrl } from "@/lib/link-detect";
import { playReplySound } from "@/lib/ui-sounds";
import { canDeleteMessage, canEditMessage } from "@/lib/message-edit-policy";
import { useChatStore } from "@/stores/chat-store";

type MessageBubbleProps = {
  message: ChatMessage;
  isOwn: boolean;
  showPeerLabel?: string;
  peerReadAt?: number;
  onReply?: (message: ChatMessage) => void;
  replyQuoteLabel?: string;
  onMediaLightbox: (payload: MediaLightboxPayload) => void;
  /** Highlights this substring in text/caption (case-insensitive). */
  highlightQuery?: string;
  /** Strong focus ring when cycling search matches. */
  isSearchActive?: boolean;
  currentUserId?: string;
  peerLabel?: string;
  onPickReaction?: (messageId: string, emoji: string) => void;
  /** Scroll to and highlight the quoted message. */
  onJumpToOriginal?: (targetMessageId: string) => void;
  /** Brief highlight on the message row (jump target). */
  isReplyFlash?: boolean;
  onEdit?: (message: ChatMessage) => void;
  onDelete?: (message: ChatMessage) => void;
  onCancelAttachmentUpload?: (message: ChatMessage) => void;
  onRetryAttachmentUpload?: (message: ChatMessage) => void;
  /** Catch-up summary: show checkbox and hide reply affordances. */
  catchUpMode?: boolean;
  catchUpSelected?: boolean;
  onCatchUpToggle?: (messageId: string) => void;
};

function StatusHint({
  status,
  createdAt,
  peerReadAt,
}: {
  status?: MessageStatus;
  createdAt: number;
  peerReadAt?: number;
}) {
  const { t } = useI18n();
  if (status === "sending") {
    return <span className="text-chat-out-foreground/65 text-[10px]">{t("messageBubble.sending")}</span>;
  }
  if (status === "failed") {
    return <span className="text-[10px] text-red-600 dark:text-red-400">{t("messageBubble.failed")}</span>;
  }
  if (status === "sent" || status === undefined) {
    const read = isReadByPeer(createdAt, peerReadAt);
    const readLabel = t("messageBubble.read");
    const deliveredLabel = t("messageBubble.delivered");
    return (
      <span
        className={cn(
          "flex items-center gap-0.5 text-[10px]",
          read ? "text-sky-700 dark:text-sky-300" : "text-chat-out-foreground/60"
        )}
        title={read ? readLabel : deliveredLabel}
        aria-label={read ? readLabel : deliveredLabel}
      >
        <CheckCheck className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
      </span>
    );
  }
  return null;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isOwn,
  showPeerLabel,
  peerReadAt,
  onReply,
  replyQuoteLabel,
  onMediaLightbox,
  highlightQuery,
  isSearchActive,
  currentUserId,
  peerLabel,
  onPickReaction,
  onJumpToOriginal,
  isReplyFlash,
  onEdit,
  onDelete,
  onCancelAttachmentUpload,
  onRetryAttachmentUpload,
  catchUpMode = false,
  catchUpSelected = false,
  onCatchUpToggle,
}: MessageBubbleProps) {
  const { t } = useI18n();
  const isDeleted = !!message.deleted;
  const ttlSec = message.disappearTtlSec;
  const expAt = message.disappearExpiresAt;
  const [disappearTick, setDisappearTick] = useState(0);
  const disappearEvictedRef = useRef(false);

  useEffect(() => {
    disappearEvictedRef.current = false;
  }, [message.id, expAt, ttlSec]);

  useEffect(() => {
    if (!ttlSec || !expAt || isDeleted) return;
    const id = window.setInterval(() => setDisappearTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [ttlSec, expAt, isDeleted]);

  useEffect(() => {
    if (!ttlSec || !expAt || isDeleted) return;
    if (disappearEvictedRef.current) return;
    const delay = Math.max(0, expAt - Date.now());
    const timer = window.setTimeout(() => {
      void (async () => {
        if (disappearEvictedRef.current) return;
        try {
          const res = await fetch(
            `/api/conversations/${encodeURIComponent(message.conversationId)}/disappearing-sweep`,
            {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ messageIds: [message.id] }),
            }
          );
          const data = (await res.json()) as { messageIds?: string[] };
          if (res.ok && data.messageIds?.includes(message.id)) {
            disappearEvictedRef.current = true;
            useChatStore.getState().removeMessagesByIds(message.conversationId, [message.id]);
          }
        } catch {
          /* network: visibility sweep or socket may still remove */
        }
      })();
    }, delay);
    return () => clearTimeout(timer);
  }, [ttlSec, expAt, isDeleted, message.id, message.conversationId]);

  const disappearOpacity =
    !ttlSec || isDeleted
      ? 1
      : !expAt
        ? 1
        : ttlSec <= 60
          ? Math.max(0.09, Math.min(1, (expAt - Date.now()) / Math.max(1, ttlSec * 1000)))
          : expAt - Date.now() < 10_000
            ? Math.max(0.22, (expAt - Date.now()) / 10_000)
            : 1;

  const disappearCountdownLabel = (() => {
    if (!ttlSec || isDeleted) return null;
    if (!expAt) return t("messageBubble.timerAfterRead");
    const secLeft = Math.max(0, Math.ceil((expAt - Date.now()) / 1000));
    if (secLeft < 120) return t("messageBubble.timerSecondsLeft", { n: secLeft });
    const minLeft = Math.max(1, Math.ceil(secLeft / 60));
    return t("messageBubble.timerMinutesLeft", { n: minLeft });
  })();

  const reply = message.replyTo;
  const displayQuoteAuthor =
    reply &&
    (reply.senderId === currentUserId
      ? t("common.you")
      : (reply.senderLabel ?? replyQuoteLabel ?? peerLabel ?? ""));

  const showSendingOverlay = message.status === "sending" && !!message.fileUrl;
  const hasAttachment = !!message.fileUrl && !isDeleted;
  const showFooterTime = !hasAttachment;
  const showFooterStatus = isOwn;
  const showFooterMeta = showFooterTime || showFooterStatus;

  const allowEdit =
    !!currentUserId && isOwn && !!onEdit && canEditMessage(message, currentUserId);
  const allowDelete =
    !!currentUserId && isOwn && !!onDelete && canDeleteMessage(message, currentUserId);

  const canOpenActionBar =
    !!currentUserId &&
    !!peerLabel &&
    !message.id.startsWith("pending:") &&
    message.status !== "failed" &&
    !isDeleted;

  const linkPreviewUrl =
    !isDeleted && message.content.trim() ? extractFirstHttpUrl(message.content) : null;

  const bubbleBlock = (
    <>
      <div
        className={cn(
          "rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm transition-shadow",
          isOwn
            ? "bg-chat-out text-chat-out-foreground rounded-be-md"
            : "bg-chat-in text-chat-in-foreground border-chat-in-border rounded-bs-md border",
          isSearchActive
            ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-[var(--chat-panel-bg)] dark:ring-amber-400/90"
            : ""
        )}
        style={{ opacity: disappearOpacity }}
      >
        {reply && displayQuoteAuthor ? (
          <button
            type="button"
            disabled={reply.deleted || !onJumpToOriginal}
            onClick={() => {
              if (!reply.deleted && onJumpToOriginal) {
                onJumpToOriginal(reply.messageId);
              }
            }}
            className={cn(
              "mb-2 w-full rounded-md border-s-2 py-1.5 ps-2 text-start text-xs transition-colors",
              isOwn
                ? "border-chat-out-foreground/45"
                : "border-emerald-600/65",
              reply.deleted || !onJumpToOriginal
                ? "cursor-default opacity-90"
                : "hover:bg-black/6 dark:hover:bg-white/8 cursor-pointer"
            )}
            aria-label={
              reply.deleted
                ? undefined
                : t("messageReply.jumpToOriginalAria", { name: displayQuoteAuthor })
            }
          >
            <span
              className={cn(
                "block font-semibold",
                isOwn ? "text-sky-200 dark:text-sky-200" : "text-sky-700 dark:text-sky-300"
              )}
            >
              {displayQuoteAuthor}
            </span>
            {reply.deleted ? (
              <span className="text-muted-foreground block min-w-0 truncate text-xs italic">
                {t("messageReply.deleted")}
              </span>
            ) : (
              <TwemojiText
                text={reply.excerpt}
                className="text-muted-foreground block min-w-0 truncate text-xs"
                highlightQuery={highlightQuery}
              />
            )}
          </button>
        ) : null}

        {message.fileUrl && !isDeleted ? (
          <ChatMediaAttachment
            message={message}
            isOwn={isOwn}
            showSendingOverlay={showSendingOverlay}
            onLightbox={onMediaLightbox}
            highlightQuery={highlightQuery}
            onCancelAttachmentUpload={
              onCancelAttachmentUpload ? () => onCancelAttachmentUpload(message) : undefined
            }
            onRetryAttachmentUpload={
              onRetryAttachmentUpload ? () => onRetryAttachmentUpload(message) : undefined
            }
          />
        ) : null}

        {message.fileUrl && !isDeleted && message.editedAt ? (
          <span
            className={cn(
              "text-[10px] opacity-75",
              isOwn ? "block text-end" : "block text-start"
            )}
          >
            ({t("messageBubble.edited")})
          </span>
        ) : null}

        {isDeleted ? (
          <p className="block text-sm leading-relaxed opacity-95">{t("messageBubble.deletedBody")}</p>
        ) : message.content.trim() ? (
          <ChatMessageBody
            content={message.content}
            isOwn={isOwn}
            className="block whitespace-pre-wrap break-words"
            highlightQuery={highlightQuery}
          />
        ) : null}
        {linkPreviewUrl ? (
          <LinkPreview
            key={`${message.id}-${linkPreviewUrl}`}
            url={linkPreviewUrl}
            isOwn={isOwn}
            fetchWhen={message.status !== "sending"}
          />
        ) : null}
      </div>
      {!isDeleted && currentUserId && peerLabel && (message.reactions?.length ?? 0) > 0 ? (
        <MessageReactionsRow
          summaries={message.reactions ?? []}
          isOwn={isOwn}
          currentUserId={currentUserId}
          peerLabel={peerLabel}
        />
      ) : null}
    </>
  );

  return (
    <div
      className={cn(
        "group inline-flex min-w-0 max-w-[min(85%,28rem)] flex-col gap-0.5 lg:max-w-[min(85%,34rem)] xl:max-w-[min(85%,40rem)]",
        isOwn ? "items-end self-end" : "items-start self-start",
        isReplyFlash && "animate-reply-flash rounded-lg"
      )}
      data-message-id={message.id}
    >
      <div
        className={cn(
          "flex max-w-full min-w-0 items-center gap-1.5",
          isOwn ? "flex-row justify-end" : "flex-row justify-start"
        )}
      >
        {!isOwn && catchUpMode && onCatchUpToggle ? (
          <label className="text-muted-foreground hover:bg-muted/80 flex shrink-0 cursor-pointer items-center rounded-md p-1.5">
            <input
              type="checkbox"
              className="size-4 accent-primary cursor-pointer"
              checked={catchUpSelected}
              disabled={message.id.startsWith("pending:")}
              onChange={() => onCatchUpToggle(message.id)}
              aria-label={t("messageBubble.catchUpSelectAria")}
            />
          </label>
        ) : null}

        <div
          className={cn(
            "inline-flex max-w-full min-w-0 items-center gap-0.5",
            isOwn ? "flex-row" : "flex-row-reverse"
          )}
        >
          <div className="min-w-0 max-w-full flex flex-col gap-0">
            {!isOwn && showPeerLabel ? (
              <span className="text-muted-foreground px-1 text-xs font-medium">{showPeerLabel}</span>
            ) : null}
            {canOpenActionBar && (onPickReaction || onReply || allowEdit || allowDelete) ? (
              <MessageReactionToolbarShell
                disabled={catchUpMode}
                isOwn={isOwn}
                onPick={onPickReaction ? (emoji) => onPickReaction(message.id, emoji) : undefined}
                onReply={
                  onReply
                    ? () => {
                        playReplySound();
                        onReply(message);
                      }
                    : undefined
                }
                onEdit={allowEdit ? () => onEdit(message) : undefined}
                onDelete={allowDelete ? () => onDelete(message) : undefined}
              >
                <div className={cn("flex flex-col gap-0", isOwn ? "items-end" : "items-start")}>{bubbleBlock}</div>
              </MessageReactionToolbarShell>
            ) : (
              <div className={cn("flex flex-col gap-0", isOwn ? "items-end" : "items-start")}>{bubbleBlock}</div>
            )}
            {showFooterMeta ? (
              <div className={cn("mt-0.5 flex items-center gap-2 px-1", isOwn ? "flex-row-reverse" : "flex-row")}>
                {showFooterTime ? (
                  <span
                    className={cn(
                      "flex items-center gap-1.5",
                      isOwn ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    <time
                      className={cn("text-[10px]", isOwn ? "text-chat-out-foreground/65" : "text-muted-foreground")}
                      dateTime={new Date(message.createdAt).toISOString()}
                    >
                      {formatChatTime(message.createdAt)}
                    </time>
                    {message.editedAt && !message.deleted ? (
                      <span
                        className={cn(
                          "text-[10px] opacity-75",
                          isOwn ? "text-chat-out-foreground/60" : "text-muted-foreground"
                        )}
                      >
                        ({t("messageBubble.edited")})
                      </span>
                    ) : null}
                    {ttlSec && !isDeleted ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                          isOwn ? "bg-black/15 text-chat-out-foreground/95" : "bg-muted/80 text-foreground/90"
                        )}
                        title={t("messageBubble.timerBadge")}
                      >
                        <Timer className="size-3 shrink-0 opacity-90" aria-hidden />
                        {disappearCountdownLabel}
                      </span>
                    ) : null}
                  </span>
                ) : null}
                {showFooterStatus ? (
                  <StatusHint status={message.status} createdAt={message.createdAt} peerReadAt={peerReadAt} />
                ) : null}
              </div>
            ) : null}
          </div>
          {onReply && !message.id.startsWith("pending:") && !catchUpMode ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              aria-label={t("messageBubble.replyAria")}
              onClick={() => {
                playReplySound();
                onReply(message);
              }}
            >
              <CornerUpLeft className="size-3.5 rtl:rotate-180" />
            </Button>
          ) : null}
        </div>

        {isOwn && catchUpMode && onCatchUpToggle ? (
          <label className="text-muted-foreground hover:bg-muted/80 flex shrink-0 cursor-pointer items-center rounded-md p-1.5">
            <input
              type="checkbox"
              className="size-4 accent-primary cursor-pointer"
              checked={catchUpSelected}
              disabled={message.id.startsWith("pending:")}
              onChange={() => onCatchUpToggle(message.id)}
              aria-label={t("messageBubble.catchUpSelectAria")}
            />
          </label>
        ) : null}
      </div>
    </div>
  );
});
