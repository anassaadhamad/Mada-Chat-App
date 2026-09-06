import { NextResponse } from "next/server";
import { requireActiveUser } from "@/server/require-active-user";
import { broadcastToConversation } from "@/lib/socket-io-bridge";
import {
  purgeDisappearingMessagesByIdsInConversation,
  purgeExpiredDisappearingMessagesInConversation,
} from "@/server/chat/conversations.service";

type RouteContext = { params: Promise<{ conversationId: string }> };

/** Purges expired disappearing messages in this conversation (hard delete + attachment removal). */
export async function POST(request: Request, context: RouteContext) {
  const gate = await requireActiveUser();
  if (!gate.ok) return gate.response;
  const userId = gate.userId;

  const { conversationId } = await context.params;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    /* no JSON body */
  }

  const rawIds =
    body &&
    typeof body === "object" &&
    "messageIds" in body &&
    Array.isArray((body as { messageIds: unknown }).messageIds)
      ? (body as { messageIds: unknown[] }).messageIds.filter((x): x is string => typeof x === "string")
      : [];

  try {
    const batch =
      rawIds.length > 0
        ? await purgeDisappearingMessagesByIdsInConversation(conversationId, userId, rawIds)
        : await purgeExpiredDisappearingMessagesInConversation(conversationId, userId);
    if (batch?.messageIds.length) {
      broadcastToConversation(conversationId, "messages:removed", {
        conversationId,
        messageIds: batch.messageIds,
      });
    }
    return NextResponse.json({
      ok: true,
      removedCount: batch?.messageIds.length ?? 0,
      messageIds: batch?.messageIds ?? [],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Conversation not found") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg === "Forbidden") {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to sweep messages" }, { status: 500 });
  }
}
