import { NextResponse } from "next/server";
import { requireActiveUser } from "@/server/require-active-user";
import { envOpenAiApiKey } from "@/lib/env-server";
import { parseClientClockFromRequestBody } from "@/lib/ai-client-clock";
import { generatePersonaReplyText } from "@/server/chat/ai-persona-reply.service";

export const maxDuration = 120;

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const gate = await requireActiveUser();
  if (!gate.ok) return gate.response;

  if (!envOpenAiApiKey()) {
    return NextResponse.json(
      { error: "AI replies are not configured (missing OPENAI_API_KEY)." },
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

  const directive =
    body && typeof body === "object" && "directive" in body
      ? String((body as { directive: unknown }).directive ?? "")
      : "";

  const parsedClock = parseClientClockFromRequestBody(body);
  if (!parsedClock.ok) {
    return NextResponse.json({ error: parsedClock.error }, { status: 400 });
  }

  try {
    const text = await generatePersonaReplyText({
      conversationId,
      senderId: gate.userId,
      directive,
      clientClock: parsedClock.clock,
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
      msg === "Directive is required" ||
      msg === "Directive too long" ||
      msg === "Empty model reply" ||
      msg === "OPENAI_API_KEY is not set"
    ) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: msg || "Suggest failed" }, { status: 500 });
  }
}
