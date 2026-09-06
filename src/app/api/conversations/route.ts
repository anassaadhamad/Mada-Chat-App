import { NextResponse } from "next/server";
import { requireActiveUser } from "@/server/require-active-user";
import {
  findUserIdByEmail,
  getOrCreateDirectConversation,
  listConversationsForUser,
} from "@/server/chat/conversations.service";

export async function GET() {
  const gate = await requireActiveUser();
  if (!gate.ok) return gate.response;
  const userId = gate.userId;

  try {
    const list = await listConversationsForUser(userId);
    return NextResponse.json({
      conversations: list.map((c) => ({
        id: c.id,
        peerLabel: c.peerLabel,
        peerUserId: c.peerUserId,
        peerAvatarUrl: c.peerAvatarUrl ?? null,
        peerBio: c.peerBio ?? "",
        peerEmail: c.peerEmail ?? "",
        lastMessagePreview: c.lastMessagePreview,
        updatedAt: c.updatedAt,
        unreadCount: c.unreadCount,
        peerLastReadAt: c.peerLastReadAt,
        peerLastSeenAt: c.peerLastSeenAt,
        blockedByMe: c.blockedByMe,
        blockedByPeer: c.blockedByPeer,
        isLockedByMe: c.isLockedByMe,
        disappearingMessageSeconds: c.disappearingMessageSeconds ?? null,
        isPinnedByMe: c.isPinnedByMe,
        pinnedAtMs: c.pinnedAtMs,
      })),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to load conversations" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gate = await requireActiveUser();
  if (!gate.ok) return gate.response;
  const userId = gate.userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email =
    body && typeof body === "object" && "participantEmail" in body
      ? String((body as { participantEmail: unknown }).participantEmail ?? "").trim().toLowerCase()
      : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid participantEmail required" }, { status: 400 });
  }

  try {
    const otherId = await findUserIdByEmail(email);
    if (!otherId) {
      return NextResponse.json({ error: "No user with that email" }, { status: 404 });
    }

    const conv = await getOrCreateDirectConversation(userId, otherId);
    return NextResponse.json({
      conversation: {
        id: conv.id,
        peerLabel: conv.peerLabel,
        peerUserId: conv.peerUserId,
        peerAvatarUrl: conv.peerAvatarUrl ?? null,
        peerBio: conv.peerBio ?? "",
        peerEmail: conv.peerEmail ?? "",
        lastMessagePreview: conv.lastMessagePreview,
        updatedAt: conv.updatedAt,
        unreadCount: conv.unreadCount,
        peerLastReadAt: conv.peerLastReadAt,
        peerLastSeenAt: conv.peerLastSeenAt,
        blockedByMe: conv.blockedByMe,
        blockedByPeer: conv.blockedByPeer,
        isLockedByMe: conv.isLockedByMe,
        disappearingMessageSeconds: conv.disappearingMessageSeconds ?? null,
        isPinnedByMe: conv.isPinnedByMe,
        pinnedAtMs: conv.pinnedAtMs,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    if (msg.includes("yourself")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg === "Blocked") {
      return NextResponse.json({ error: "You cannot chat with this user" }, { status: 403 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });
  }
}
