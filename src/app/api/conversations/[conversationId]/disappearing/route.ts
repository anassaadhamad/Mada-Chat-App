import { NextResponse } from "next/server";
import { requireActiveUser } from "@/server/require-active-user";
import { broadcastToConversation } from "@/lib/socket-io-bridge";
import { parseDisappearingPatchSeconds } from "@/lib/disappearing-policy";
import {
  createDisappearingTimerSystemNotice,
  setConversationDisappearingSeconds,
} from "@/server/chat/conversations.service";

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
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

  if (!body || typeof body !== "object" || !("seconds" in body)) {
    return NextResponse.json({ error: "seconds field required" }, { status: 400 });
  }

  let normalized: number | null;
  try {
    normalized = parseDisappearingPatchSeconds((body as { seconds: unknown }).seconds);
  } catch {
    return NextResponse.json({ error: "Invalid disappearing timer" }, { status: 400 });
  }

  try {
    const seconds = await setConversationDisappearingSeconds(conversationId, userId, normalized);
    const notice = await createDisappearingTimerSystemNotice(conversationId, userId, seconds);
    broadcastToConversation(conversationId, "conversation:disappearing", {
      conversationId,
      disappearingMessageSeconds: seconds,
    });
    broadcastToConversation(conversationId, "message:new", { message: notice });
    return NextResponse.json({ disappearingMessageSeconds: seconds });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Conversation not found") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg === "Forbidden") {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    if (msg === "Invalid disappearing timer") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg === "Blocked" || msg.includes("Messaging")) {
      return NextResponse.json({ error: "Messaging is not available" }, { status: 403 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to update timer" }, { status: 500 });
  }
}
