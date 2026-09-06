import { NextResponse } from "next/server";
import { requireActiveUser } from "@/server/require-active-user";
import { setConversationPinnedForUser } from "@/server/chat/conversations.service";
import { broadcastToUser } from "@/lib/socket-io-bridge";

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function PATCH(req: Request, ctx: RouteContext) {
  const gate = await requireActiveUser();
  if (!gate.ok) return gate.response;

  const { conversationId } = await ctx.params;
  if (!conversationId?.trim()) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const pinned =
    body && typeof body === "object" && "pinned" in body ? Boolean((body as { pinned: unknown }).pinned) : null;

  if (pinned === null) {
    return NextResponse.json({ error: "pinned boolean required" }, { status: 400 });
  }

  try {
    const { pinnedAtMs } = await setConversationPinnedForUser(conversationId, gate.userId, pinned);
    broadcastToUser(gate.userId, "conversation:pin", {
      conversationId,
      pinned,
      pinnedAtMs,
    });
    return NextResponse.json({ ok: true, pinned, pinnedAtMs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden" || msg.includes("Invalid id")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (msg === "Conversation not found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to update pin" }, { status: 500 });
  }
}
