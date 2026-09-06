import { connectDB } from "@/lib/mongodb";
import type { ChatMessage } from "@/lib/chat-types";
import { logError } from "@/lib/server-logger";
import { Conversation } from "@/server/models/Conversation";
import { getAiAgentConversationSettings } from "@/server/chat/ai-agent-settings.service";
import { runPersonaChunkedSendJob } from "@/server/chat/ai-persona-reply.service";

const debounceUntil = new Map<string, number>();
const AUTOPILOT_DEBOUNCE_MS = 2500;

function debounceKey(actingUserId: string, conversationId: string): string {
  return `${actingUserId}:${conversationId}`;
}

export type AutopilotTriggerInput = {
  conversationId: string;
  /** User id who authored the newly persisted message. */
  messageSenderId: string;
  message: ChatMessage;
  appOrigin: string;
};

/**
 * After a message is persisted, if the non-sender has Autopilot enabled, generate and send a reply
 * as that user. Skips AI-originated rows to avoid ping-pong.
 */
export function maybeQueueAutopilotReply(input: AutopilotTriggerInput): void {
  void (async () => {
    try {
      if (input.message.fromAiAgent) return;
      if (input.message.systemNotice) return;

      const { conversationId, messageSenderId, appOrigin, message } = input;
      if (message.senderId !== messageSenderId) return;

      await connectDB();
      const conv = await Conversation.findById(conversationId).select("participantIds").lean();
      if (!conv?.participantIds?.length) return;

      const ids = conv.participantIds.map((p) => p.toString());
      const actingUserId = ids.find((id) => id !== messageSenderId);
      if (!actingUserId) return;

      const settings = await getAiAgentConversationSettings(actingUserId, conversationId);
      if (settings.mode !== "autopilot" || !settings.directive.trim()) return;

      const key = debounceKey(actingUserId, conversationId);
      const now = Date.now();
      if (now < (debounceUntil.get(key) ?? 0)) return;
      debounceUntil.set(key, now + AUTOPILOT_DEBOUNCE_MS);

      await runPersonaChunkedSendJob({
        conversationId,
        senderId: actingUserId,
        directive: settings.directive,
        appOrigin,
        fromAiAgent: true,
      });
    } catch (e) {
      logError("[ai-autopilot] maybeQueueAutopilotReply", e);
    }
  })();
}
