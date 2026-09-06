import { NextResponse } from "next/server";
import { requireActiveUser } from "@/server/require-active-user";
import { broadcastToConversation } from "@/lib/socket-io-bridge";
import { editMessage, softDeleteMessage } from "@/server/chat/conversations.service";

type RouteContext = { params: Promise<{ conversationId: string; messageId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
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

  const content =
    body && typeof body === "object" && "content" in body
      ? String((body as { content: unknown }).content ?? "")
      : "";

  try {
    const message = await editMessage(conversationId, userId, messageId, content);
    broadcastToConversation(conversationId, "message:updated", { message });
    return NextResponse.json({ message });
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
    if (
      msg === "Edit window expired" ||
      msg === "Empty message" ||
      msg === "Message too long" ||
      msg === "Message deleted"
    ) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg === "Conversation not found") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to edit message" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const gate = await requireActiveUser();
  if (!gate.ok) return gate.response;
  const userId = gate.userId;

  const { conversationId, messageId } = await context.params;

  try {
    const message = await softDeleteMessage(conversationId, userId, messageId);
    broadcastToConversation(conversationId, "message:updated", { message });
    return NextResponse.json({ message });
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
    if (msg === "Already deleted") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to delete message" }, { status: 500 });
  }
}
