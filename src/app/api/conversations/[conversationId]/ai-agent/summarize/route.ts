import { NextResponse } from "next/server";
import { requireActiveUser } from "@/server/require-active-user";
import { envOpenAiApiKey } from "@/lib/env-server";
import { parseClientClockFromRequestBody } from "@/lib/ai-client-clock";
import { generateCatchUpSummary } from "@/server/chat/ai-catch-up-summarize.service";

export const maxDuration = 120;

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const gate = await requireActiveUser();
  if (!gate.ok) return gate.response;

  if (!envOpenAiApiKey()) {
    return NextResponse.json(
      { error: "AI summaries are not configured (missing OPENAI_API_KEY)." },
      { status: 503 }
    );
  }

  const { conversationId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsedClock = parseClientClockFromRequestBody(body);
  if (!parsedClock.ok) {
    return NextResponse.json({ error: parsedClock.error }, { status: 400 });
  }

  const messageIds =
    body && typeof body === "object" && "messageIds" in body && Array.isArray((body as { messageIds: unknown }).messageIds)
      ? (body as { messageIds: unknown[] }).messageIds.map((x) => String(x ?? "").trim()).filter(Boolean)
      : [];

  try {
    const text = await generateCatchUpSummary({
      conversationId,
      userId: gate.userId,
      messageIds,
    });
    return NextResponse.json({ text });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Conversation not found") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg === "Forbidden" || msg === "Blocked") {
      return NextResponse.json({ error: "Messaging is not available" }, { status: 403 });
    }
    if (
      msg === "No messages selected" ||
      msg.startsWith("Too many messages") ||
      msg === "Invalid message id" ||
      msg === "No matching messages in this conversation" ||
      msg === "Empty model summary" ||
      msg === "OPENAI_API_KEY is not set"
    ) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: msg || "Summarize failed" }, { status: 500 });
  }
}
