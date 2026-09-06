import type { IncomingMessage } from "http";
import type { Server as SocketIOServer, Socket } from "socket.io";
import { devLog, devWarn, logError } from "../src/lib/server-logger";
import { connectDB } from "../src/lib/mongodb";
import { assertParticipant } from "../src/server/chat/conversations.service";
import {
  assertConversationMessagingAllowed,
  getOtherParticipantId,
  usersBlockEachOther,
} from "../src/server/blocking.service";
import { Conversation } from "../src/server/models/Conversation";
import { User } from "../src/server/models/User";
import { getUserIdFromHandshake } from "./socket-auth";
import { zegoRoomIdFromConversationId } from "../src/lib/zego-room-id";

const ROOM = (conversationId: string) => `conv:${conversationId}`;
const USER_ROOM = (userId: string) => `user:${userId}`;

/** Coalesce rapid typing:start from clients; still allows a fresh burst after ~2.8s. */
const typingStartLastMs = new Map<string, number>();

const onlineCountByUserId = new Map<string, number>();

function bumpOnline(userId: string, delta: number) {
  const next = (onlineCountByUserId.get(userId) ?? 0) + delta;
  if (next <= 0) {
    onlineCountByUserId.delete(userId);
  } else {
    onlineCountByUserId.set(userId, next);
  }
}

function isUserOnline(userId: string): boolean {
  return (onlineCountByUserId.get(userId) ?? 0) > 0;
}

async function onlineParticipantIds(conversationId: string): Promise<string[]> {
  await connectDB();
  const conv = await Conversation.findById(conversationId).lean();
  if (!conv) return [];
  const ids = conv.participantIds.map((p) => p.toString()).filter((id) => isUserOnline(id));
  if (ids.length === 0) return [];
  const users = await User.find({ _id: { $in: ids } })
    .select("preferences.showOnlineStatus")
    .lean();
  const visible = new Set(
    users
      .filter((u) => {
        const p = (u as { preferences?: { showOnlineStatus?: boolean } }).preferences;
        return p?.showOnlineStatus !== false;
      })
      .map((u) => u._id.toString())
  );
  return ids.filter((id) => visible.has(id));
}

function emitPresence(io: SocketIOServer, conversationId: string) {
  void onlineParticipantIds(conversationId)
    .then((onlineUserIds) => {
      io.to(ROOM(conversationId)).emit("presence:conversation", {
        conversationId,
        onlineUserIds,
      });
    })
    .catch((err) => {
      devWarn(
        "[socket] emitPresence failed:",
        err instanceof Error ? err.message : err
      );
    });
}

async function emitMessageToParticipants(
  io: SocketIOServer,
  conversationId: string,
  payload: { message: unknown },
  exceptUserId?: string
): Promise<void> {
  await connectDB();
  const conv = await Conversation.findById(conversationId).select("participantIds").lean();
  if (!conv) return;
  for (const participantId of conv.participantIds.map((p) => p.toString())) {
    if (exceptUserId && participantId === exceptUserId) continue;
    if (
      exceptUserId &&
      participantId !== exceptUserId &&
      (await usersBlockEachOther(exceptUserId, participantId))
    ) {
      continue;
    }
    io.to(USER_ROOM(participantId)).emit("message:new", payload);
  }
}

/** Same delivery path as `message:new` from this server — `user:{id}` rooms (not only `conv:`). */
async function emitTypingToParticipants(
  io: SocketIOServer,
  conversationId: string,
  fromUserId: string,
  typing: boolean
): Promise<void> {
  await connectDB();
  const conv = await Conversation.findById(conversationId).select("participantIds").lean();
  if (!conv) return;
  const payload = { conversationId, userId: fromUserId, typing };
  for (const participantId of conv.participantIds.map((p) => p.toString())) {
    if (participantId === fromUserId) continue;
    if (await usersBlockEachOther(fromUserId, participantId)) continue;
    io.to(USER_ROOM(participantId)).emit("typing:update", payload);
  }
}

/**
 * Join a conv room if missing; emit presence only on first join. No console spam (used by conversations:sync).
 */
async function ensureInConvRoom(
  socket: Socket,
  io: SocketIOServer,
  conversationId: string,
  userId: string
): Promise<void> {
  await assertParticipant(conversationId, userId);
  const room = ROOM(conversationId);
  if (socket.rooms.has(room)) return;
  await socket.join(room);
  emitPresence(io, conversationId);
}

/**
 * Client explicitly opened a thread — log once per event; avoid duplicate join / presence if sync already joined.
 */
async function joinConversationRoom(
  socket: Socket,
  io: SocketIOServer,
  conversationId: unknown,
  userId: string,
  ack?: (r: unknown) => void
): Promise<void> {
  try {
    if (typeof conversationId !== "string") {
      ack?.({ ok: false, error: "Invalid conversation" });
      return;
    }
    await assertParticipant(conversationId, userId);
    const room = ROOM(conversationId);
    if (!socket.rooms.has(room)) {
      devLog(`User joined room: ${room}`);
      await socket.join(room);
      emitPresence(io, conversationId);
    }
    let onlineUserIds = await onlineParticipantIds(conversationId);
    try {
      const peer = await getOtherParticipantId(conversationId, userId);
      if (await usersBlockEachOther(userId, peer)) {
        onlineUserIds = onlineUserIds.filter((id) => id !== peer);
      }
    } catch {
      /* ignore */
    }
    ack?.({ ok: true, onlineUserIds });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "join failed";
    ack?.({ ok: false, error: msg });
  }
}

export function registerSocketHandlers(io: SocketIOServer) {
  io.engine.on("connection_error", (err) => {
    devWarn("[socket] engine connection_error", err.message);
  });

  io.use(async (socket, next) => {
    try {
      const req = socket.request as IncomingMessage;
      const userId = await getUserIdFromHandshake(req);
      if (!userId) {
        next(new Error("Unauthorized"));
        return;
      }
      await connectDB();
      const u = await User.findById(userId).select("suspendedAt").lean();
      if (u?.suspendedAt) {
        next(new Error("Forbidden"));
        return;
      }
      socket.data.userId = userId;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", async (socket: Socket) => {
    const userId = socket.data.userId as string;
    bumpOnline(userId, 1);
    try {
      await socket.join(USER_ROOM(userId));
    } catch (e) {
      devWarn(
        "[socket] join user room failed:",
        e instanceof Error ? e.message : e
      );
    }
    devLog(`[socket] authenticated id=${socket.id} userId=${userId}`);

    socket.on("conversations:sync", async (rawIds: unknown, ack?: (r: unknown) => void) => {
      try {
        if (!Array.isArray(rawIds)) {
          ack?.({ ok: false, error: "Invalid payload" });
          return;
        }
        const ids = rawIds.filter((x): x is string => typeof x === "string");
        for (const conversationId of ids) {
          try {
            await ensureInConvRoom(socket, io, conversationId, userId);
          } catch {
            /* skip invalid rooms */
          }
        }
        ack?.({ ok: true });
      } catch (e) {
        logError("[socket] conversations:sync", e);
        ack?.({ ok: false, error: "sync failed" });
      }
    });

    socket.on("conversation:join", async (conversationId: unknown, ack?: (r: unknown) => void) => {
      await joinConversationRoom(socket, io, conversationId, userId, ack);
    });

    socket.on("join:conversation", async (conversationId: unknown, ack?: (r: unknown) => void) => {
      await joinConversationRoom(socket, io, conversationId, userId, ack);
    });

    socket.on("call:invite", async (payload: unknown, ack?: (r: unknown) => void) => {
      try {
        if (!payload || typeof payload !== "object") {
          ack?.({ ok: false, error: "Invalid payload" });
          return;
        }
        const conversationId = (payload as { conversationId?: unknown }).conversationId;
        const callType = (payload as { callType?: unknown }).callType;
        if (typeof conversationId !== "string" || !conversationId.trim()) {
          ack?.({ ok: false, error: "Invalid conversation" });
          return;
        }
        if (callType !== "voice" && callType !== "video") {
          ack?.({ ok: false, error: "Invalid call type" });
          return;
        }
        await assertParticipant(conversationId, userId);
        await assertConversationMessagingAllowed(conversationId, userId);
        const peer = await getOtherParticipantId(conversationId, userId);
        if (await usersBlockEachOther(userId, peer)) {
          ack?.({ ok: false, error: "Blocked" });
          return;
        }
        const caller = await User.findById(userId).select("name email").lean();
        const fromUserName =
          (caller && typeof (caller as { name?: string }).name === "string" && (caller as { name: string }).name.trim()) ||
          (caller && typeof (caller as { email?: string }).email === "string" && (caller as { email: string }).email.trim()) ||
          "Someone";
        const roomID = zegoRoomIdFromConversationId(conversationId);
        io.to(USER_ROOM(peer)).emit("call:incoming", {
          conversationId,
          roomID,
          callType,
          fromUserId: userId,
          fromUserName,
        });
        ack?.({ ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "invite failed";
        devWarn("[socket] call:invite failed:", msg);
        ack?.({ ok: false, error: msg });
      }
    });

    // Message persistence runs in Next.js API routes (shared Mongoose with the app).
    // This avoids a second Mongoose instance from the tsx-loaded socket bundle hanging on writes.
    socket.on(
      "message:publish",
      async (
        payload: unknown,
        ack?: (r: { ok: boolean; error?: string }) => void
      ) => {
        try {
          if (!payload || typeof payload !== "object") {
            ack?.({ ok: false, error: "Invalid payload" });
            return;
          }
          const rawMessage = (payload as { message?: unknown }).message;
          if (!rawMessage || typeof rawMessage !== "object") {
            ack?.({ ok: false, error: "Missing message" });
            return;
          }
          const message = rawMessage as {
            conversationId?: unknown;
            senderId?: unknown;
          };
          const conversationId =
            typeof message.conversationId === "string" ? message.conversationId : "";
          const senderId = typeof message.senderId === "string" ? message.senderId : "";
          if (!conversationId || !senderId) {
            ack?.({ ok: false, error: "Invalid message" });
            return;
          }
          if (senderId !== userId) {
            ack?.({ ok: false, error: "Sender mismatch" });
            return;
          }
          await assertParticipant(conversationId, userId);
          await assertConversationMessagingAllowed(conversationId, userId);
          const msgContent =
            typeof (rawMessage as { content?: unknown }).content === "string"
              ? String((rawMessage as { content: string }).content).slice(0, 500)
              : "";
          devLog(`New message received in socket: ${msgContent || "(empty / attachment)"}`);
          await emitMessageToParticipants(io, conversationId, { message: rawMessage }, userId);
          ack?.({ ok: true });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "publish failed";
          ack?.({ ok: false, error: msg });
        }
      }
    );

    socket.on("typing:start", async (payload: unknown) => {
      if (!payload || typeof payload !== "object") return;
      const conversationId = (payload as { conversationId?: unknown }).conversationId;
      if (typeof conversationId !== "string") return;
      const throttleKey = `${userId}:${conversationId}`;
      const t = Date.now();
      if (t - (typingStartLastMs.get(throttleKey) ?? 0) < 2800) return;
      try {
        await assertParticipant(conversationId, userId);
        const peer = await getOtherParticipantId(conversationId, userId);
        if (await usersBlockEachOther(userId, peer)) return;
        typingStartLastMs.set(throttleKey, t);
        await emitTypingToParticipants(io, conversationId, userId, true);
        devLog(`[socket] typing:start conv=${conversationId} user=${userId}`);
      } catch (e) {
        devWarn(
          "[socket] typing:start failed:",
          e instanceof Error ? e.message : e
        );
      }
    });

    socket.on("typing:stop", async (payload: unknown) => {
      if (!payload || typeof payload !== "object") return;
      const conversationId = (payload as { conversationId?: unknown }).conversationId;
      if (typeof conversationId !== "string") return;
      typingStartLastMs.delete(`${userId}:${conversationId}`);
      try {
        await assertParticipant(conversationId, userId);
        const peer = await getOtherParticipantId(conversationId, userId);
        if (await usersBlockEachOther(userId, peer)) return;
        await emitTypingToParticipants(io, conversationId, userId, false);
        devLog(`[socket] typing:stop conv=${conversationId} user=${userId}`);
      } catch (e) {
        devWarn(
          "[socket] typing:stop failed:",
          e instanceof Error ? e.message : e
        );
      }
    });

    socket.on("disconnect", (reason: string) => {
      bumpOnline(userId, -1);
      devLog(`[socket] disconnect id=${socket.id} userId=${userId} reason=${reason}`);
      void connectDB()
        .then(async () => {
          try {
            await User.updateOne({ _id: userId }, { $set: { lastSeenAt: new Date() } });
          } catch {
            /* ignore */
          }
        })
        .catch((err) => {
          devWarn("[socket] disconnect lastSeenAt skipped:", err instanceof Error ? err.message : err);
        });
      const rooms = [...socket.rooms].filter((r) => r.startsWith("conv:"));
      for (const room of rooms) {
        const conversationId = room.slice("conv:".length);
        emitPresence(io, conversationId);
      }
    });
  });
}
