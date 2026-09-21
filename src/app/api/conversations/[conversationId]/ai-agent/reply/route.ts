import { NextResponse } from "next/server";
import { requireActiveUser } from "@/server/require-active-user";
import { runPersonaReplyJob } from "@/server/chat/ai-persona-reply.service";
import { envHasAiConfigured } from "@/lib/env-server";
import { parseClientClockFromRequestBody } from "@/lib/ai-client-clock";

export const maxDuration = 120;

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const gate = await requireActiveUser();
  if (!gate.ok) return gate.response;

  if (!envHasAiConfigured()) {
    return NextResponse.json(
      { error: "AI replies are not configured (missing OPENROUTER_API_KEY or GROQ_API_KEY)." },
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

  const appOrigin = new URL(request.url).origin;

  try {
    const { chunksSent } = await runPersonaReplyJob({
      conversationId,
      senderId: gate.userId,
      directive,
      appOrigin,
      clientClock: parsedClock.clock,
    });
    return NextResponse.json({ ok: true, chunksSent });
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
      msg === "Empty reply chunks" ||
      msg === "Empty message" ||
      msg === "Message too long"
    ) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg.startsWith("OPENAI_API_KEY")) {
      return NextResponse.json({ error: msg }, { status: 503 });
    }
    console.error(e);
    return NextResponse.json({ error: msg || "AI reply failed" }, { status: 500 });
  }
}
