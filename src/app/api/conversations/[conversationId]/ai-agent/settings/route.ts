import { NextResponse } from "next/server";
import { requireActiveUser } from "@/server/require-active-user";
import { envOpenAiApiKey } from "@/lib/env-server";
import {
  getAiAgentConversationSettings,
  setAiAgentConversationSettings,
  type AiAgentMode,
} from "@/server/chat/ai-agent-settings.service";

type RouteContext = { params: Promise<{ conversationId: string }> };

function isMode(v: unknown): v is AiAgentMode {
  return v === "off" || v === "suggested" || v === "autopilot";
}

export async function GET(_request: Request, context: RouteContext) {
  const gate = await requireActiveUser();
  if (!gate.ok) return gate.response;
  const { conversationId } = await context.params;
  try {
    const settings = await getAiAgentConversationSettings(gate.userId, conversationId);
    return NextResponse.json({
      ...settings,
      openAiConfigured: Boolean(envOpenAiApiKey()),
      aiConfigured: Boolean(envOpenAiApiKey()),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (msg === "Invalid id") {
      return NextResponse.json({ error: "Invalid conversation" }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const gate = await requireActiveUser();
  if (!gate.ok) return gate.response;
  const { conversationId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const modeRaw = body && typeof body === "object" && "mode" in body ? (body as { mode: unknown }).mode : null;
  const directive =
    body && typeof body === "object" && "directive" in body
      ? String((body as { directive: unknown }).directive ?? "")
      : "";

  if (!isMode(modeRaw)) {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }

  try {
    await setAiAgentConversationSettings(gate.userId, conversationId, {
      mode: modeRaw,
      directive,
    });
    const settings = await getAiAgentConversationSettings(gate.userId, conversationId);
    return NextResponse.json({ ok: true, ...settings });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (msg === "Invalid id") {
      return NextResponse.json({ error: "Invalid conversation" }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
