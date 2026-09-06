import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireActiveUser } from "@/server/require-active-user";
import { assertParticipant } from "@/server/chat/conversations.service";
import { assertConversationMessagingAllowed } from "@/server/blocking.service";
import { envZegoAppId, envZegoServerSecret } from "@/lib/env-server";
import { zegoRoomIdFromConversationId } from "@/lib/zego-room-id";
import { generateToken04 } from "@/server/zego/generate-token04";
import { generateZegoKitToken } from "@/server/zego/generate-kit-token";

export async function POST(req: Request) {
  const gate = await requireActiveUser();
  if (!gate.ok) return gate.response;

  const appId = envZegoAppId();
  const serverSecret = envZegoServerSecret();
  if (!appId || !serverSecret) {
    return NextResponse.json({ error: "Voice and video calls are not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const conversationId =
    body && typeof body === "object" && typeof (body as { conversationId?: unknown }).conversationId === "string"
      ? String((body as { conversationId: string }).conversationId).trim()
      : "";

  if (!conversationId) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }

  try {
    await assertParticipant(conversationId, gate.userId);
    await assertConversationMessagingAllowed(conversationId, gate.userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Forbidden" || msg.includes("Invalid id")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (msg === "Conversation not found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: "Could not start call" }, { status: 500 });
  }

  const session = await auth();
  const userName =
    (session?.user?.name && String(session.user.name).trim()) ||
    (session?.user?.email && String(session.user.email).trim()) ||
    "User";

  const roomID = zegoRoomIdFromConversationId(conversationId);
  const userID = gate.userId;

  let rtcToken: string;
  try {
    rtcToken = generateToken04(appId, userID, serverSecret, 7200, "");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Token error";
    if (msg.includes("key length") || msg.includes("secret")) {
      return NextResponse.json(
        {
          error:
            "Invalid Zego server secret length. Use the App Server Secret from the console (16, 24, or 32 bytes when read as UTF-8).",
        },
        { status: 500 }
      );
    }
    console.error(e);
    return NextResponse.json({ error: "Could not issue call token" }, { status: 500 });
  }

  const kitToken = generateZegoKitToken({
    appID: appId,
    token: rtcToken,
    roomID,
    userID,
    userName,
  });

  return NextResponse.json({ kitToken, roomID });
}
