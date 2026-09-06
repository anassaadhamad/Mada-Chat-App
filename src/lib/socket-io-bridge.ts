import type { Server as SocketIOServer } from "socket.io";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { Conversation } from "@/server/models/Conversation";
import { User } from "@/server/models/User";
import { devLog, devWarn, logError } from "@/lib/server-logger";
import { usersBlockEachOther } from "@/server/blocking.service";

/**
 * Next.js may evaluate `@/lib/socket-io-bridge` in a different module instance than
 * `server/socket.ts`, so a plain `let io` would stay null in API routes and broadcasts
 * would silently do nothing. `globalThis` shares one server across all copies.
 */
const GLOBAL_IO_KEY = "__SECRET_CHAT_SOCKET_IO_SERVER__" as const;

type GlobalWithIo = typeof globalThis & { [GLOBAL_IO_KEY]?: SocketIOServer | null };

export function getSocketIOServer(): SocketIOServer | null {
  return (globalThis as GlobalWithIo)[GLOBAL_IO_KEY] ?? null;
}

function getIo(): SocketIOServer | null {
  return getSocketIOServer();
}

function setIo(server: SocketIOServer | null): void {
  (globalThis as GlobalWithIo)[GLOBAL_IO_KEY] = server;
}

/** Called once from the custom Node server when Socket.io starts. */
export function bindSocketIOServer(server: SocketIOServer): void {
  setIo(server);
}

function actorUserIdForBlockFilter(event: string, payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  if (event === "message:new" || event === "message:updated") {
    const m = (payload as { message?: { senderId?: unknown } }).message;
    if (m && typeof m === "object" && typeof m.senderId === "string") return m.senderId;
    return null;
  }
  if (event === "typing:update") {
    const u = (payload as { userId?: unknown }).userId;
    return typeof u === "string" ? u : null;
  }
  if (event === "conversation:read") {
    const r = (payload as { readerId?: unknown }).readerId;
    return typeof r === "string" ? r : null;
  }
  if (event === "message:reactions") {
    const r = (payload as { reactorId?: unknown }).reactorId;
    return typeof r === "string" ? r : null;
  }
  return null;
}

async function shouldSkipBlockedMirror(
  recipientUserId: string,
  event: string,
  payload: unknown
): Promise<boolean> {
  const actor = actorUserIdForBlockFilter(event, payload);
  if (!actor || actor === recipientUserId) return false;
  return usersBlockEachOther(recipientUserId, actor);
}

function previewPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const msg = (payload as { message?: { content?: unknown } }).message;
  if (msg && typeof msg === "object" && "content" in msg) {
    const c = String((msg as { content?: unknown }).content ?? "").slice(0, 120);
    return c || "(no text)";
  }
  return "";
}

const USER_ROOM = (userId: string) => `user:${userId}`;

/** Notify a single user's sockets (e.g. per-user pin state that peers must not see). */
export function broadcastToUser(userId: string, event: string, payload: unknown): void {
  const io = getIo();
  if (!io) {
    const g = globalThis as GlobalWithIo & { __SECRET_CHAT_IO_WARNED_USER__?: boolean };
    if (!g.__SECRET_CHAT_IO_WARNED_USER__) {
      g.__SECRET_CHAT_IO_WARNED_USER__ = true;
      devWarn("[socket-io-bridge] broadcastToUser skipped: Socket.io server not bound.");
    }
    return;
  }
  io.to(USER_ROOM(userId)).emit(event, payload);
  devLog(`[socket-io-bridge] emit "${event}" to ${USER_ROOM(userId)}`);
}

/** Notify everyone in a conversation room (used from Next.js route handlers). */
export function broadcastToConversation(
  conversationId: string,
  event: string,
  payload: unknown
): void {
  const io = getIo();
  if (!io) {
    const g = globalThis as GlobalWithIo & { __SECRET_CHAT_IO_WARNED__?: boolean };
    if (!g.__SECRET_CHAT_IO_WARNED__) {
      g.__SECRET_CHAT_IO_WARNED__ = true;
      devWarn(
        "[socket-io-bridge] broadcast skipped: Socket.io server not bound. Run via `npm run dev` / `npm run start` (custom server), not `next dev` / `next start` alone."
      );
    }
    return;
  }

  const room = `conv:${conversationId}`;
  io.to(room).emit(event, payload);
  devLog(
    `[socket-io-bridge] emit "${event}" to ${room}; payload preview: ${previewPayload(payload)}`
  );

  /** Also fan out to `user:{id}` rooms so peers receive events even if they missed `conv:` sync. */
  void (async () => {
    try {
      await connectDB();
      const conv = await Conversation.findById(conversationId).select("participantIds").lean();
      if (!conv?.participantIds?.length) return;
      for (const p of conv.participantIds) {
        const uid = p.toString();
        if (await shouldSkipBlockedMirror(uid, event, payload)) continue;
        io.to(`user:${uid}`).emit(event, payload);
      }
      devLog(
        `[socket-io-bridge] mirrored "${event}" to user rooms for conversation ${conversationId}`
      );
    } catch (e) {
      logError("[socket-io-bridge] mirror to user rooms failed", e);
    }
  })();
}

/** Emit `typing:update` to other participants (mirrors socket `typing:start` / `typing:stop` relay). */
export async function emitTypingUpdateForPeers(
  conversationId: string,
  fromUserId: string,
  typing: boolean
): Promise<void> {
  const io = getIo();
  if (!io) return;
  try {
    await connectDB();
    const conv = await Conversation.findById(conversationId).select("participantIds").lean();
    if (!conv?.participantIds?.length) return;
    const payload = { conversationId, userId: fromUserId, typing };
    for (const participantId of conv.participantIds.map((p) => p.toString())) {
      if (participantId === fromUserId) continue;
      if (await usersBlockEachOther(fromUserId, participantId)) continue;
      io.to(USER_ROOM(participantId)).emit("typing:update", payload);
    }
  } catch (e) {
    logError("[socket-io-bridge] emitTypingUpdateForPeers", e);
  }
}

/**
 * Push updated public profile to every user who shares a DM with `profileUserId`.
 * Uses `user:{peerId}` rooms (joined on socket connect).
 */
export async function notifyPeersProfileUpdated(profileUserId: string): Promise<void> {
  const io = getIo();
  if (!io) return;
  try {
    await connectDB();
    const me = await User.findById(profileUserId).select("name email image bio deletedAt").lean();
    if (!me || me.deletedAt) return;

    const peerLabel = me.name?.trim() || me.email || "Unknown";
    const peerEmail = me.email ?? "";
    const peerAvatarUrl =
      me.image && String(me.image).trim() !== "" ? String(me.image) : null;
    const peerBio = typeof me.bio === "string" ? me.bio : "";

    const oid = new mongoose.Types.ObjectId(profileUserId);
    const convs = await Conversation.find({ participantIds: oid }).select("participantIds").lean();
    const peerIds = new Set<string>();
    for (const c of convs) {
      for (const p of c.participantIds) {
        const id = p.toString();
        if (id !== profileUserId) peerIds.add(id);
      }
    }

    const payload = {
      userId: profileUserId,
      peerLabel,
      peerAvatarUrl,
      peerBio,
      peerEmail,
    };

    for (const peerId of peerIds) {
      if (await usersBlockEachOther(profileUserId, peerId)) continue;
      io.to(USER_ROOM(peerId)).emit("peer:profile", payload);
    }
    devLog(`[socket-io-bridge] peer:profile → ${peerIds.size} peer room(s) for user ${profileUserId}`);
  } catch (e) {
    logError("[socket-io-bridge] notifyPeersProfileUpdated", e);
  }
}
