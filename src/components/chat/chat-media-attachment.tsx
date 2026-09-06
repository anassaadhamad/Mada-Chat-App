"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { Download, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatChatTime } from "@/lib/format-chat-time";
import { formatFileSize } from "@/lib/format-file-size";
import type { ChatMessage } from "@/lib/chat-types";
import type { MediaLightboxPayload } from "@/components/chat/media-lightbox";
import { VoiceNotePlayer } from "@/components/chat/voice-note-player";
import { splitHighlightSegments } from "@/lib/chat-search";
import { AttachmentUploadOverlay } from "@/components/chat/attachment-upload-overlay";

const glassOverlayBar =
  "pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-2 pb-2 pt-8";

const glassIconBtn =
  "rounded-full border border-white/25 bg-black/40 p-2 text-white shadow-lg backdrop-blur-md transition-colors hover:bg-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40";

function GlassStatChip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "pointer-events-auto inline-flex items-center rounded-md border border-white/20 bg-black/35 px-2 py-0.5 text-[10px] font-medium text-white/95 backdrop-blur-md",
        className
      )}
    >
      {children}
    </span>
  );
}

type ChatMediaAttachmentProps = {
  message: ChatMessage;
  isOwn: boolean;
  showSendingOverlay: boolean;
  onLightbox: (payload: MediaLightboxPayload) => void;
  highlightQuery?: string;
  onCancelAttachmentUpload?: () => void;
  onRetryAttachmentUpload?: () => void;
};

function HighlightedFileName({ name, query }: { name: string; query?: string }) {
  const q = query?.trim() ?? "";
  if (!q) {
    return <>{name}</>;
  }
  const parts = splitHighlightSegments(name, q);
  return (
    <>
      {parts.map((p, i) =>
        p.mark ? (
          <mark
            key={i}
            className="rounded bg-amber-200/95 px-0.5 text-inherit dark:bg-amber-500/40"
          >
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  );
}

function inferVideoFromUrl(url: string): boolean {
  return /\.(mp4|webm|ogg|mov|m4v)$/i.test(url);
}

export function ChatMediaAttachment({
  message,
  isOwn,
  showSendingOverlay,
  onLightbox,
  highlightQuery,
  onCancelAttachmentUpload,
  onRetryAttachmentUpload,
}: ChatMediaAttachmentProps) {
  const videoPeekRef = useRef<HTMLVideoElement>(null);

  const isVideo =
    message.fileType === "video" ||
    (!message.fileType && !!message.fileUrl && inferVideoFromUrl(message.fileUrl));

  const isImage =
    message.fileType === "image" ||
    (!message.fileType &&
      !!message.fileUrl &&
      /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(message.fileUrl));

  const isAudio =
    message.fileType === "audio" ||
    (!!message.fileUrl && /\.(weba|m4a|mp3|ogg|opus|wav|oga)$/i.test(message.fileUrl));

  const sizeLabel =
    message.fileSize != null && Number.isFinite(message.fileSize)
      ? formatFileSize(message.fileSize)
      : null;

  const timeLabel = formatChatTime(message.createdAt);

  const showUploadChrome =
    !!message.fileUrl && (showSendingOverlay || message.status === "failed");

  const cancelHandler =
    message.status === "sending" && message.attachmentUpload?.phase === "uploading"
      ? onCancelAttachmentUpload
      : undefined;
  const retryHandler = message.status === "failed" ? onRetryAttachmentUpload : undefined;
  const hasCaption = message.content.trim().length > 0;

  const safeFileName =
    message.fileName?.trim() ||
    (message.fileUrl ? (message.fileUrl.split("/").pop() ?? "") : "") ||
    "attachment";

  const downloadAttachment = useCallback(() => {
    if (!message.fileUrl) return;
    const a = document.createElement("a");
    a.href = message.fileUrl;
    a.download = safeFileName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [message.fileUrl, safeFileName]);

  const openViewer = useCallback(() => {
    if (!message.fileUrl) return;
    if (isImage) {
      onLightbox({ src: message.fileUrl, kind: "image", fileName: safeFileName });
    } else if (isVideo) {
      onLightbox({ src: message.fileUrl, kind: "video", fileName: safeFileName });
    }
  }, [message.fileUrl, isImage, isVideo, onLightbox, safeFileName]);

  useEffect(() => {
    const el = videoPeekRef.current;
    if (!el || !isVideo) return;
    const onMeta = () => {
      try {
        el.currentTime = 0.05;
      } catch {
        /* ignore */
      }
    };
    el.addEventListener("loadeddata", onMeta);
    return () => el.removeEventListener("loadeddata", onMeta);
  }, [isVideo, message.fileUrl]);

  if (isAudio && message.fileUrl) {
    return (
      <div className={cn("mb-1 w-full", hasCaption ? "mb-2" : "")}>
        <VoiceNotePlayer
          src={message.fileUrl}
          isOwn={isOwn}
          playbackId={message.id}
          showSendingOverlay={showUploadChrome}
          uploadOverlay={
            showUploadChrome ? (
              <AttachmentUploadOverlay
                message={message}
                isOwn={isOwn}
                onCancel={cancelHandler}
                onRetry={retryHandler}
              />
            ) : undefined
          }
        />
      </div>
    );
  }

  if (isImage && message.fileUrl) {
    return (
      <div className={cn("relative mb-1 w-full max-w-[min(100%,18rem)] sm:max-w-xs", hasCaption ? "mb-2" : "")}>
        <button
          type="button"
          className={cn(
            "relative block w-full overflow-hidden rounded-xl bg-black/20 outline-none ring-1 ring-black/10 focus-visible:ring-2 focus-visible:ring-ring",
            showUploadChrome && "pointer-events-none cursor-default"
          )}
          disabled={showUploadChrome}
          onClick={openViewer}
          aria-label="View image full screen"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={message.fileUrl}
            alt={safeFileName}
            className="aspect-[4/3] max-h-72 w-full object-cover sm:h-56 sm:max-h-none"
          />
          <div className={glassOverlayBar}>
            <div className="pointer-events-none flex items-end justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1">
                <GlassStatChip>{timeLabel}</GlassStatChip>
                {sizeLabel ? <GlassStatChip>{sizeLabel}</GlassStatChip> : null}
              </div>
            </div>
          </div>
          {showUploadChrome ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
              <AttachmentUploadOverlay
                message={message}
                isOwn={isOwn}
                onCancel={cancelHandler}
                onRetry={retryHandler}
              />
            </div>
          ) : null}
        </button>
        {!showUploadChrome ? (
          <button
            type="button"
            className={cn(glassIconBtn, "absolute top-2 end-2 z-10")}
            aria-label="Download image"
            onClick={(e) => {
              e.stopPropagation();
              downloadAttachment();
            }}
          >
            <Download className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
    );
  }

  if (isVideo && message.fileUrl) {
    return (
      <div className={cn("relative mb-1 w-full max-w-[min(100%,18rem)] sm:max-w-xs", hasCaption ? "mb-2" : "")}>
        <div
          className={cn(
            "relative cursor-pointer overflow-hidden rounded-xl bg-black ring-1 ring-black/15",
            showUploadChrome && "pointer-events-none cursor-default"
          )}
          role="button"
          tabIndex={showUploadChrome ? -1 : 0}
          onClick={openViewer}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openViewer();
            }
          }}
          aria-label="Open video"
        >
          <video
            ref={videoPeekRef}
            src={message.fileUrl}
            muted
            playsInline
            preload="metadata"
            className="aspect-video max-h-72 w-full object-cover sm:h-56 sm:max-h-none"
          />
          {!showUploadChrome ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
              <span className="flex size-14 items-center justify-center rounded-full border border-white/40 bg-black/45 shadow-xl backdrop-blur-md">
                <Play className="ml-0.5 size-8 text-white drop-shadow-md" fill="currentColor" aria-hidden />
              </span>
            </div>
          ) : null}
          <div className={glassOverlayBar}>
            <div className="pointer-events-none flex items-end justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1">
                <GlassStatChip>{timeLabel}</GlassStatChip>
                {sizeLabel ? <GlassStatChip>{sizeLabel}</GlassStatChip> : null}
              </div>
            </div>
          </div>
          {showUploadChrome ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm">
              <AttachmentUploadOverlay
                message={message}
                isOwn={isOwn}
                onCancel={cancelHandler}
                onRetry={retryHandler}
              />
            </div>
          ) : null}
        </div>
        {!showUploadChrome ? (
          <button
            type="button"
            className={cn(glassIconBtn, "absolute top-2 end-2 z-10")}
            aria-label="Download video"
            onClick={(e) => {
              e.stopPropagation();
              downloadAttachment();
            }}
          >
            <Download className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative mb-2">
      <div
        className={cn(
          "relative flex max-w-[min(100%,20rem)] flex-col rounded-xl border px-3 py-3 shadow-sm",
          isOwn ? "border-chat-out-foreground/25 bg-black/15" : "border-border bg-muted/60"
        )}
      >
        <div className="flex items-start gap-3">
          <div className="bg-background/80 flex size-11 shrink-0 items-center justify-center rounded-lg border backdrop-blur-sm">
            <span className="text-[11px] font-bold tracking-tight">
              {message.fileType === "pdf" ? "PDF" : "FILE"}
            </span>
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="truncate text-sm font-semibold">
              <HighlightedFileName name={message.fileName ?? "Attachment"} query={highlightQuery} />
            </p>
            <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-[10px]">
              <span>{timeLabel}</span>
              {sizeLabel ? <span>{sizeLabel}</span> : null}
            </div>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="bg-background/55 text-foreground hover:bg-background/80 size-9 shrink-0 rounded-full border border-white/25 backdrop-blur-md"
            aria-label="Download file"
            disabled={showUploadChrome}
            onClick={(e) => {
              e.stopPropagation();
              downloadAttachment();
            }}
          >
            <Download className="size-4" />
          </Button>
        </div>
        {showUploadChrome ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/30 backdrop-blur-[1px]">
            <AttachmentUploadOverlay
              message={message}
              isOwn={isOwn}
              onCancel={cancelHandler}
              onRetry={retryHandler}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
