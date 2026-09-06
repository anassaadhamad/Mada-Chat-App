import type { ChatMessage } from "@/lib/chat-types";
import type { Locale } from "@/i18n/config";
import { stripSpoilerSpansForPreview } from "@/lib/chat-preview";

type MsgPick = Pick<ChatMessage, "content" | "fileUrl" | "fileType" | "fileName" | "deleted">;

const BODY: Record<
  Locale,
  {
    deleted: string;
    photo: string;
    voice: string;
    video: string;
    file: string;
    fileNamed: string;
    lockedBody: string;
    lockedTitle: string;
  }
> = {
  en: {
    deleted: "Message deleted",
    photo: "Sent a photo",
    voice: "Sent a voice message",
    video: "Sent a video",
    file: "Sent a file",
    fileNamed: "Sent a file: {name}",
    lockedBody: "New message",
    lockedTitle: "Mada",
  },
  fr: {
    deleted: "Message supprimé",
    photo: "A envoyé une photo",
    voice: "A envoyé un message vocal",
    video: "A envoyé une vidéo",
    file: "A envoyé un fichier",
    fileNamed: "A envoyé un fichier : {name}",
    lockedBody: "Nouveau message",
    lockedTitle: "Mada",
  },
  ar: {
    deleted: "تم حذف الرسالة",
    photo: "أرسل صورة",
    voice: "أرسل رسالة صوتية",
    video: "أرسل فيديو",
    file: "أرسل ملفًا",
    fileNamed: "أرسل ملفًا: {name}",
    lockedBody: "رسالة جديدة",
    lockedTitle: "Mada",
  },
};

export function resolveLocaleForPush(raw: string | undefined | null): Locale {
  if (raw === "fr" || raw === "ar" || raw === "en") return raw;
  return "en";
}

/** Plain-text notification body for Web Push (mirrors client i18n `notifications.*`). */
export function notificationBodyForMessage(
  message: MsgPick,
  locale: Locale,
  opts?: { privacyLock?: boolean }
): string {
  const b = BODY[locale] ?? BODY.en;
  if (opts?.privacyLock) return b.lockedBody;
  if (message.deleted) return b.deleted;
  if (message.fileType === "image" && message.fileUrl) return b.photo;
  if (message.fileType === "video" && message.fileUrl) return b.video;
  if (message.fileType === "audio" && message.fileUrl) return b.voice;
  if (message.fileUrl && message.fileName) {
    const name = message.fileName.slice(0, 80);
    return b.fileNamed.replace("{name}", name);
  }
  if (message.fileUrl) return b.file;
  return stripSpoilerSpansForPreview((message.content ?? "").trim()).slice(0, 200);
}

export function notificationTitleForLockedChat(locale: Locale): string {
  const b = BODY[locale] ?? BODY.en;
  return b.lockedTitle;
}
