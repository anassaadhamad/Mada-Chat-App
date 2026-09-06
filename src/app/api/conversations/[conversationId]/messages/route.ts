import { NextResponse } from "next/server";
import { requireActiveUser } from "@/server/require-active-user";
import type { MessageFileType } from "@/lib/chat-types";
import { broadcastToConversation } from "@/lib/socket-io-bridge";
import mongoose from "mongoose";
import {
  createMessage,
  listMessagesBeforeMessageId,
  listMessagesForConversation,
  purgeExpiredDisappearingMessages,
} from "@/server/chat/conversations.service";
import { notifyNewMessageViaWebPush } from "@/server/notify-new-message-push";
import { maybeQueueAutopilotReply } from "@/server/chat/ai-autopilot.service";

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function GET(request: Request, context: RouteContext) {
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

    const url = new URL(request.url);
    const before = url.searchParams.get("before")?.trim() ?? "";
    const limitRaw = url.searchParams.get("limit");
    let pageLimit: number | undefined;
    if (limitRaw) {
      const n = Number(limitRaw);
      if (Number.isFinite(n)) pageLimit = Math.floor(n);
    }

    if (before && mongoose.isValidObjectId(before)) {
      const { messages, hasOlder } = await listMessagesBeforeMessageId(
        conversationId,
        userId,
        before,
        pageLimit
      );
      return NextResponse.json({ messages, hasOlder });
    }

    const { messages, peerReadAt, hasOlder } = await listMessagesForConversation(
      conversationId,
      userId
    );
    return NextResponse.json({ messages, peerReadAt, hasOlder });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Conversation not found") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg === "Forbidden") {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to load messages" }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const gate = await requireActiveUser();
  if (!gate.ok) return gate.response;
  const userId = gate.userId;

  const { conversationId } = await context.params;

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
  const replyToMessageId =
    body && typeof body === "object" && "replyToMessageId" in body
      ? String((body as { replyToMessageId: unknown }).replyToMessageId ?? "").trim() || null
      : null;

  let attachment: {
    fileUrl: string;
    fileType: MessageFileType;
    fileName: string;
    fileSize?: number;
  } | null = null;
  if (
    body &&
    typeof body === "object" &&
    "fileUrl" in body &&
    "fileType" in body &&
    "fileName" in body
  ) {
    const fileUrl = String((body as { fileUrl: unknown }).fileUrl ?? "").trim();
    const fileType = String((body as { fileType: unknown }).fileType ?? "").trim() as MessageFileType;
    const fileName = String((body as { fileName: unknown }).fileName ?? "").trim();
    const rawSize = (body as { fileSize?: unknown }).fileSize;
    let fileSize: number | undefined;
    if (typeof rawSize === "number" && Number.isFinite(rawSize)) {
      fileSize = rawSize;
    } else if (typeof rawSize === "string" && rawSize.trim()) {
      const n = Number(rawSize);
      if (Number.isFinite(n)) fileSize = n;
    }
    if (fileUrl && fileType && fileName) {
      attachment = { fileUrl, fileType, fileName, ...(fileSize != null ? { fileSize } : {}) };
    }
  }

  try {
    const message = await createMessage(
      conversationId,
      userId,
      content,
      replyToMessageId,
      attachment
    );
    const purged = await purgeExpiredDisappearingMessages();
    for (const batch of purged) {
      broadcastToConversation(batch.conversationId, "messages:removed", {
        conversationId: batch.conversationId,
        messageIds: batch.messageIds,
      });
    }
    broadcastToConversation(conversationId, "message:new", { message });
    const appOrigin = new URL(request.url).origin;
    void notifyNewMessageViaWebPush({
      conversationId,
      message,
      senderUserId: userId,
      appOrigin,
    });
    maybeQueueAutopilotReply({
      conversationId,
      messageSenderId: userId,
      message,
      appOrigin,
    });
    return NextResponse.json({ message });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Conversation not found") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg === "Forbidden") {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    if (msg === "Blocked") {
      return NextResponse.json({ error: "Messaging is not available" }, { status: 403 });
    }
    if (msg === "Empty message" || msg === "Message too long" || msg === "Invalid id") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (
      msg === "Invalid attachment URL" ||
      msg === "File name too long" ||
      msg === "Invalid file type" ||
      msg === "Invalid file size"
    ) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
