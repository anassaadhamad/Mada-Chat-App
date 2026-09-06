import type { ChatMessage } from "@/lib/chat-types";

export const MESSAGE_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function canEditMessage(message: ChatMessage, currentUserId: string): boolean {
  if (message.systemNotice) return false;
  if (message.senderId !== currentUserId) return false;
  if (message.deleted) return false;
  if (message.status === "sending" || message.status === "failed") return false;
  if (message.id.startsWith("pending:")) return false;
  if (Date.now() - message.createdAt > MESSAGE_EDIT_WINDOW_MS) return false;
  return true;
}

export function canDeleteMessage(message: ChatMessage, currentUserId: string): boolean {
  if (message.systemNotice) return false;
  if (message.senderId !== currentUserId) return false;
  if (message.deleted) return false;
  if (message.status === "sending" || message.status === "failed") return false;
  if (message.id.startsWith("pending:")) return false;
  return true;
}
