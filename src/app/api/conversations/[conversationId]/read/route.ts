import { NextResponse } from "next/server";
import { requireActiveUser } from "@/server/require-active-user";
import { broadcastToConversation } from "@/lib/socket-io-bridge";
import { markConversationRead, purgeExpiredDisappearingMessages, scheduleDisappearingForMessagesReadBy } from "@/server/chat/conversations.service";

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const gate = await requireActiveUser();
  if (!gate.ok) return gate.response;
  const userId = gate.userId;

  const { conversationId } = await context.params;

  try {
    const purged = await purgeExpiredDisappearingMessages();
    for (const batch of purged) {
      broadcastToConversation(batch.conversationId, "messages:removed", {
        conversationId: batch.conversationId,
        messageIds: batch.messageIds,
      });
    }

    const { readAt, conversationId: id, didUpdate } = await markConversationRead(
      conversationId,
      userId
    );
    if (didUpdate) {
      broadcastToConversation(id, "conversation:read", {
        conversationId: id,
        readerId: userId,
        readAt,
      });
      const updates = await scheduleDisappearingForMessagesReadBy(id, userId, new Date(readAt));
      if (updates.length) {
        broadcastToConversation(id, "messages:disappear-scheduled", {
          conversationId: id,
          updates,
        });
      }
    }
    return NextResponse.json({ ok: true, readAt, didUpdate });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Conversation not found") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg === "Forbidden") {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to mark read" }, { status: 500 });
  }
}
