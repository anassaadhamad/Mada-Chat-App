"use client";

import type { ReactNode } from "react";
import { Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/chat-types";
import { useI18n } from "@/components/i18n/i18n-provider";
import { formatBytesAndSpeed } from "@/lib/format-transfer-speed";
import { formatFileSize } from "@/lib/format-file-size";

type AttachmentUploadOverlayProps = {
  message: ChatMessage;
  isOwn: boolean;
  onCancel?: () => void;
  onRetry?: () => void;
};

export function AttachmentUploadOverlay({
  message,
  isOwn,
  onCancel,
  onRetry,
}: AttachmentUploadOverlayProps): ReactNode {
  const { t } = useI18n();
  const au = message.attachmentUpload;
  const total = au?.totalBytes ?? message.fileSize ?? 0;

  if (message.status === "failed") {
    const err = au?.error?.trim() || t("upload.errorGeneric");
    return (
      <div className="flex min-h-[7rem] flex-col items-center justify-center gap-3 px-4 py-4 text-center">
        <p className="text-sm font-medium text-white">{err}</p>
        {onRetry ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="gap-2 bg-white/90 text-emerald-900 hover:bg-white"
            onClick={(e) => {
              e.stopPropagation();
              onRetry();
            }}
          >
            <RefreshCw className="size-4" />
            {t("upload.retry")}
          </Button>
        ) : null}
      </div>
    );
  }

  if (!au) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-6">
        <span className="size-10 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
      </div>
    );
  }

  if (au.phase === "processing") {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-6">
        <Loader2 className="size-9 animate-spin text-white" aria-hidden />
        <p className="text-sm font-medium text-white">{t("upload.processing")}</p>
      </div>
    );
  }

  const pct = Math.max(0, Math.min(100, au.progress));
  const stats =
    total > 0 ? formatBytesAndSpeed(total, au.speedBps ?? 0) : formatFileSize(total);

  return (
    <div className="flex w-full max-w-[16rem] flex-col gap-3 px-3 py-4">
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/20">
        <div
          className="h-full rounded-full bg-white transition-[width] duration-150 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-start text-[11px] font-medium text-white/95">
        <span className="tabular-nums">{pct}%</span>
        {stats ? <span className="min-w-0 truncate text-white/85">{stats}</span> : null}
      </div>
      {onCancel ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(
            "h-8 w-full border-white/35 bg-black/25 text-white hover:bg-black/40",
            isOwn && "border-white/40"
          )}
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
        >
          <X className="size-3.5" />
          {t("upload.cancel")}
        </Button>
      ) : null}
    </div>
  );
}
