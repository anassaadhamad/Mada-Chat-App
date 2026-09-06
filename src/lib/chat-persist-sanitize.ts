import type { ChatMessage } from "@/lib/chat-types";

const MAX_MESSAGES_PER_CONVERSATION = 160;

function trimConversationMessages(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= MAX_MESSAGES_PER_CONVERSATION) return messages;
  return messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
}

/** Shapes persisted chat rows: drops blob URLs, upload UI state, and caps message list length per thread. */
export function sanitizeMessagesForPersist(byConv: Record<string, ChatMessage[]>): Record<string, ChatMessage[]> {
  const out: Record<string, ChatMessage[]> = {};
  for (const [conversationId, msgs] of Object.entries(byConv)) {
    out[conversationId] = trimConversationMessages(msgs).map((m) => {
      const { attachmentUpload: _upload, ...rest } = m;
      const fileUrl = rest.fileUrl?.startsWith("blob:") ? undefined : rest.fileUrl;
      return { ...rest, fileUrl };
    });
  }
  return out;
}
