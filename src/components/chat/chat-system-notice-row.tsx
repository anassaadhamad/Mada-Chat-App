"use client";

import type { ChatMessage } from "@/lib/chat-types";
import { disappearDurationShortLabel } from "@/lib/disappearing-ui-labels";
import { useI18n } from "@/components/i18n/i18n-provider";
import { cn } from "@/lib/utils";

type ChatSystemNoticeRowProps = {
  message: ChatMessage;
  currentUserId: string;
  peerLabel: string;
};

export function ChatSystemNoticeRow({ message, currentUserId, peerLabel }: ChatSystemNoticeRowProps) {
  const { t } = useI18n();
  const sn = message.systemNotice;
  if (!sn || sn.kind !== "disappearing_timer") return null;

  const isSelf = message.senderId === currentUserId;
  const sec = sn.seconds;
  const label = sec != null && sec > 0 ? disappearDurationShortLabel(sec, t) : null;

  let text: string;
  if (sec == null || sec <= 0) {
    text = isSelf
      ? t("chat.systemNoticeDisappearingYouOff")
      : t("chat.systemNoticeDisappearingPeerOff", { name: peerLabel });
  } else {
    text = isSelf
      ? t("chat.systemNoticeDisappearingYouOn", { label: label ?? "" })
      : t("chat.systemNoticeDisappearingPeerOn", { name: peerLabel, label: label ?? "" });
  }

  return (
    <div className="flex w-full justify-center px-2 py-1" data-message-id={message.id}>
      <p
        className={cn(
          "text-muted-foreground max-w-[min(92%,28rem)] text-center text-[12px] leading-snug font-medium lg:max-w-[min(92%,40rem)] xl:max-w-[min(92%,52rem)]",
          "select-none"
        )}
        role="status"
      >
        {text}
      </p>
    </div>
  );
}
