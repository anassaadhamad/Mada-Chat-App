import { NextResponse } from "next/server";
import { requireActiveUser } from "@/server/require-active-user";
import { setConversationLockedForUser } from "@/server/chat/conversations.service";

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

  const locked =
    body && typeof body === "object" && "locked" in body ? Boolean((body as { locked: unknown }).locked) : null;

  if (locked === null) {
    return NextResponse.json({ error: "locked boolean required" }, { status: 400 });
  }

  try {
    await setConversationLockedForUser(conversationId, gate.userId, locked);
    return NextResponse.json({ ok: true, locked });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden" || msg.includes("Invalid id")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (msg === "Conversation not found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to update lock" }, { status: 500 });
  }
}
