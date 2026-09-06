import { NextResponse } from "next/server";
import { requireActiveUser } from "@/server/require-active-user";
import { broadcastToConversation } from "@/lib/socket-io-bridge";
import { toggleMessageReaction } from "@/server/chat/conversations.service";

type RouteContext = { params: Promise<{ conversationId: string; messageId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const gate = await requireActiveUser();
  if (!gate.ok) return gate.response;
  const userId = gate.userId;

  const { conversationId, messageId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const emoji =
    body && typeof body === "object" && "emoji" in body
      ? String((body as { emoji: unknown }).emoji ?? "").trim()
      : "";
  if (!emoji) {
    return NextResponse.json({ error: "Missing emoji" }, { status: 400 });
  }

  try {
    const result = await toggleMessageReaction(conversationId, userId, messageId, emoji);
    broadcastToConversation(conversationId, "message:reactions", {
      conversationId,
      messageId: result.messageId,
      reactions: result.reactions,
      reactorId: userId,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Message not found") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg === "Forbidden") {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    if (msg === "Blocked") {
      return NextResponse.json({ error: "Messaging is not available" }, { status: 403 });
    }
    if (msg === "Invalid reaction") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to react" }, { status: 500 });
  }
}
