import type { ChatMessage } from "@/lib/chat-types";
import { parseSpoilerPipeSegments } from "@/lib/spoiler-segments";
import { encodeDisappearingTimerPreview } from "@/lib/system-message-preview";

/**
 * Replaces each Discord-style `||spoiler||` span (including fullwidth `｜｜` delimiters) with an
 * ellipsis so list/push previews do not show raw pipe characters or hidden text.
 */
export function stripSpoilerSpansForPreview(content: string): string {
  return parseSpoilerPipeSegments(content)
    .map((seg) => (seg.type === "spoiler" ? "…" : seg.text))
    .join("");
}

/** Single-line preview for sidebar and reply quotes. */
export function chatPreviewLine(
  message: Pick<ChatMessage, "content" | "fileUrl" | "fileType" | "fileName" | "deleted" | "systemNotice">
): string {
  if (message.systemNotice?.kind === "disappearing_timer") {
    return encodeDisappearingTimerPreview(message.systemNotice.seconds);
  }
  if (message.deleted) {
    return "Message deleted";
  }
  if (message.fileType === "image" && message.fileUrl) {
    return "📷 Photo";
  }
  if (message.fileType === "video" && message.fileUrl) {
    return "🎬 Video";
  }
  if (message.fileType === "audio" && message.fileUrl) {
    return "🎤 Voice Message";
  }
  if (message.fileUrl && message.fileName) {
    return `📎 ${message.fileName}`.slice(0, 120);
  }
  if (message.fileUrl) {
    return "📎 File";
  }
  return stripSpoilerSpansForPreview(message.content ?? "").slice(0, 120);
}
