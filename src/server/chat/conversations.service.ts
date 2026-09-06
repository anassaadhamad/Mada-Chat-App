import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { Conversation } from "@/server/models/Conversation";
import { Message } from "@/server/models/Message";
import { User } from "@/server/models/User";
import type {
  ChatMessage,
  MessageFileType,
  MessageReactionSummary,
  MessageReplyRef,
} from "@/lib/chat-types";
import { chatPreviewLine } from "@/lib/chat-preview";
import {
  aggregateReactions,
  isAllowedReactionEmoji,
  reactionsFromRawDoc,
  sortReactionSummaries,
} from "@/lib/message-reactions";
import { isStoredUploadFileName } from "@/lib/upload-stored-name";
import { MESSAGE_EDIT_WINDOW_MS } from "@/lib/message-edit-policy";
import {
  envMessageFileNameMax,
  envMessageListInitialLimit,
  envMessageListOlderPageDefault,
  envMessageListOlderPageMax,
  envMessageMaxContentLength,
  envMessageReplyExcerptMax,
} from "@/lib/env-server";
import { assertConversationMessagingAllowed, usersBlockEachOther } from "@/server/blocking.service";
import { tryDeleteStoredUploadPublicUrl } from "@/server/upload-file-delete";
import { isAllowedDisappearingTtlSec } from "@/lib/disappearing-policy";
import { encodeDisappearingTimerPreview } from "@/lib/system-message-preview";

function toObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.isValidObjectId(id)) {
    throw new Error("Invalid id");
  }
  return new mongoose.Types.ObjectId(id);
}

function previewFromMessageDoc(doc: {
  content?: string | null;
  fileUrl?: string | null;
  fileType?: string | null;
  fileName?: string | null;
  deletedAt?: Date | null;
  isSystemNotice?: boolean | null;
  systemNoticeKind?: string | null;
  systemNoticeSeconds?: unknown;
}): string {
  if (doc.deletedAt) {
    return chatPreviewLine({ deleted: true, content: "", fileUrl: undefined, fileType: undefined, fileName: undefined });
  }
  if (doc.isSystemNotice && doc.systemNoticeKind === "disappearing_timer") {
    const raw = doc.systemNoticeSeconds;
    const sec =
      typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : null;
    return encodeDisappearingTimerPreview(sec);
  }
  return chatPreviewLine({
    content: doc.content ?? "",
    fileUrl: doc.fileUrl ?? undefined,
    fileType: doc.fileType as MessageFileType | undefined,
    fileName: doc.fileName ?? undefined,
  });
}

export function directKeyForPair(userIdA: string, userIdB: string): string {
  const [a, b] = [userIdA, userIdB].sort();
  return `${a}:${b}`;
}

export function readAtMsFromConv(readAtByUser: unknown, userId: string): number {
  if (!readAtByUser || typeof readAtByUser !== "object") return 0;
  const raw = (readAtByUser as Record<string, unknown>)[userId];
  if (raw == null) return 0;
  const d = raw instanceof Date ? raw : new Date(String(raw));
  const t = d.getTime();
  return Number.isFinite(t) ? t : 0;
}

export function pinnedAtMsFromConv(pinnedAtByUser: unknown, userId: string): number {
  if (!pinnedAtByUser || typeof pinnedAtByUser !== "object") return 0;
  const raw = (pinnedAtByUser as Record<string, unknown>)[userId];
  if (raw == null) return 0;
  const d = raw instanceof Date ? raw : new Date(String(raw));
  const t = d.getTime();
  return Number.isFinite(t) ? t : 0;
}

function sortConversationInbox<T extends { isPinnedByMe: boolean; pinnedAtMs: number; updatedAt: number }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    const ap = a.isPinnedByMe ? 1 : 0;
    const bp = b.isPinnedByMe ? 1 : 0;
    if (ap !== bp) return bp - ap;
    if (ap === 1) {
      const apt = a.pinnedAtMs ?? 0;
      const bpt = b.pinnedAtMs ?? 0;
      if (apt !== bpt) return bpt - apt;
    }
    return b.updatedAt - a.updatedAt;
  });
}

function normalizeStoredDisappearingSeconds(raw: unknown): number | null {
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return isAllowedDisappearingTtlSec(n) ? n : null;
}

export function isConversationLockedForUser(doc: { lockedByUserIds?: unknown }, userId: string): boolean {
  const ids = doc.lockedByUserIds;
  if (!Array.isArray(ids)) return false;
  return ids.some((x) => {
    if (x != null && typeof x === "object" && "toString" in x) {
      return (x as { toString: () => string }).toString() === userId;
    }
    return String(x) === userId;
  });
}

export async function getOrCreateDirectConversation(
  currentUserId: string,
  otherUserId: string
): Promise<ConversationListItem> {
  if (currentUserId === otherUserId) {
    throw new Error("Cannot start a conversation with yourself");
  }

  await connectDB();

  if (await usersBlockEachOther(currentUserId, otherUserId)) {
    throw new Error("Blocked");
  }

  const selfOid = toObjectId(currentUserId);
  const otherOid = toObjectId(otherUserId);
  const key = directKeyForPair(currentUserId, otherUserId);

  let conv = await Conversation.findOne({ directKey: key });

  if (!conv) {
    conv = await Conversation.create({
      participantIds: [selfOid, otherOid],
      directKey: key,
    });
  } else {
    const ids = conv.participantIds.map((p) => p.toString());
    if (!ids.includes(currentUserId) || !ids.includes(otherUserId)) {
      throw new Error("Conversation participants mismatch");
    }
  }

  const other = await User.findById(otherOid)
    .select("name email lastSeenAt blockedUserIds image bio")
    .lean();
  const peerLabel = other?.name?.trim() || other?.email || "Unknown";
  const peerEmail = other?.email ?? "";
  const peerAvatarUrl =
    other?.image && String(other.image).trim() !== "" ? String(other.image) : null;
  const peerBio = typeof other?.bio === "string" ? other.bio : "";

  const updatedAt = conv.lastMessageAt?.getTime() ?? conv.updatedAt?.getTime() ?? Date.now();
  const lastMsg = await Message.findOne({ conversationId: conv._id }).sort({ createdAt: -1 }).lean();
  const lastMessagePreview = lastMsg ? previewFromMessageDoc(lastMsg) : "";

  const readAtByUser = (conv as { readAtByUser?: unknown }).readAtByUser;
  const peerLastReadAt = readAtMsFromConv(readAtByUser, otherUserId);
  const peerLastSeenAt = other?.lastSeenAt ? new Date(other.lastSeenAt).getTime() : null;

  const isLockedByMe = isConversationLockedForUser(conv, currentUserId);

  const disappearingMessageSeconds = normalizeStoredDisappearingSeconds(
    (conv as { disappearingMessageSeconds?: unknown }).disappearingMessageSeconds
  );

  const pinnedAtByUser = (conv as { pinnedAtByUser?: unknown }).pinnedAtByUser;
  const pinnedAtMs = pinnedAtMsFromConv(pinnedAtByUser, currentUserId);
  const isPinnedByMe = pinnedAtMs > 0;

  const me = await User.findById(selfOid).select("blockedUserIds").lean();
  const myBlocked = new Set((me?.blockedUserIds ?? []).map((x) => x.toString()));
  const blockedByMe = myBlocked.has(otherUserId);
  const blockedByPeer = (other?.blockedUserIds ?? []).some((x) => x.toString() === currentUserId);

  return {
    id: conv._id.toString(),
    peerLabel,
    peerUserId: otherUserId,
    peerAvatarUrl,
    peerBio,
    peerEmail,
    updatedAt,
    lastMessagePreview,
    unreadCount: 0,
    peerLastReadAt,
    peerLastSeenAt,
    blockedByMe,
    blockedByPeer,
    isLockedByMe,
    disappearingMessageSeconds,
    isPinnedByMe,
    pinnedAtMs,
  };
}

export type ConversationListItem = {
  id: string;
  peerLabel: string;
  peerUserId: string;
  /** Other participant's profile image URL (same as User.image). */
  peerAvatarUrl: string | null;
  peerBio: string;
  peerEmail: string;
  lastMessagePreview: string;
  updatedAt: number;
  unreadCount: number;
  peerLastReadAt: number;
  peerLastSeenAt: number | null;
  blockedByMe: boolean;
  blockedByPeer: boolean;
  isLockedByMe: boolean;
  /** Shared disappearing-messages TTL (seconds); null = off. */
  disappearingMessageSeconds: number | null;
  isPinnedByMe: boolean;
  pinnedAtMs: number;
};

export async function listConversationsForUser(userId: string): Promise<ConversationListItem[]> {
  await connectDB();
  const uid = toObjectId(userId);

  const me = await User.findById(uid).select("blockedUserIds").lean();
  const myBlocked = new Set((me?.blockedUserIds ?? []).map((x) => x.toString()));

  const convs = await Conversation.find({ participantIds: uid }).lean();

  const items: ConversationListItem[] = [];

  for (const c of convs) {
    const pids = c.participantIds.map((p) => p.toString());
    const otherId = pids.find((p) => p !== userId);
    if (!otherId) continue;

    const other = await User.findById(toObjectId(otherId))
      .select("name email lastSeenAt blockedUserIds image bio")
      .lean();
    const peerLabel = other?.name?.trim() || other?.email || "Unknown";
    const peerEmail = other?.email ?? "";
    const peerAvatarUrl =
      other?.image && String(other.image).trim() !== "" ? String(other.image) : null;
    const peerBio = typeof other?.bio === "string" ? other.bio : "";
    const blockedByMe = myBlocked.has(otherId);
    const blockedByPeer = (other?.blockedUserIds ?? []).some((x) => x.toString() === userId);

    const lastMsg = await Message.findOne({ conversationId: c._id }).sort({ createdAt: -1 }).lean();
    const readAtByUser = (c as { readAtByUser?: unknown }).readAtByUser;
    const pinnedAtByUser = (c as { pinnedAtByUser?: unknown }).pinnedAtByUser;
    const pinnedAtMs = pinnedAtMsFromConv(pinnedAtByUser, userId);
    const isPinnedByMe = pinnedAtMs > 0;
    const myRead = readAtMsFromConv(readAtByUser, userId);
    const peerLastReadAt = readAtMsFromConv(readAtByUser, otherId);
    const peerLastSeenAt = other?.lastSeenAt ? new Date(other.lastSeenAt).getTime() : null;

    const unreadFilter: Record<string, unknown> = {
      conversationId: c._id,
      senderId: { $ne: uid },
    };
    if (myRead > 0) {
      unreadFilter.createdAt = { $gt: new Date(myRead) };
    }
    const unreadCount = await Message.countDocuments(unreadFilter);

    items.push({
      id: c._id.toString(),
      peerLabel,
      peerUserId: otherId,
      peerAvatarUrl,
      peerBio,
      peerEmail,
      lastMessagePreview: lastMsg ? previewFromMessageDoc(lastMsg) : "",
      updatedAt: lastMsg?.createdAt?.getTime() ?? c.updatedAt?.getTime() ?? Date.now(),
      unreadCount,
      peerLastReadAt,
      peerLastSeenAt,
      blockedByMe,
      blockedByPeer,
      isLockedByMe: isConversationLockedForUser(c, userId),
      disappearingMessageSeconds: normalizeStoredDisappearingSeconds(
        (c as { disappearingMessageSeconds?: unknown }).disappearingMessageSeconds
      ),
      isPinnedByMe,
      pinnedAtMs,
    });
  }

  return sortConversationInbox(items);
}

export async function assertParticipant(conversationId: string, userId: string): Promise<void> {
  await connectDB();
  const conv = await Conversation.findById(conversationId).lean();
  if (!conv) {
    throw new Error("Conversation not found");
  }
  const ok = conv.participantIds.some((p) => p.toString() === userId);
  if (!ok) {
    throw new Error("Forbidden");
  }
}

export async function setConversationLockedForUser(
  conversationId: string,
  userId: string,
  locked: boolean
): Promise<void> {
  await assertParticipant(conversationId, userId);
  const uid = toObjectId(userId);
  const cid = toObjectId(conversationId);
  if (locked) {
    await Conversation.updateOne({ _id: cid }, { $addToSet: { lockedByUserIds: uid } });
  } else {
    await Conversation.updateOne({ _id: cid }, { $pull: { lockedByUserIds: uid } });
  }
}

export async function setConversationPinnedForUser(
  conversationId: string,
  userId: string,
  pinned: boolean
): Promise<{ pinnedAtMs: number | null }> {
  await assertParticipant(conversationId, userId);
  const cid = toObjectId(conversationId);
  if (pinned) {
    const now = new Date();
    await Conversation.updateOne({ _id: cid }, { $set: { [`pinnedAtByUser.${userId}`]: now } });
    return { pinnedAtMs: now.getTime() };
  }
  await Conversation.updateOne({ _id: cid }, { $unset: { [`pinnedAtByUser.${userId}`]: "" } });
  return { pinnedAtMs: null };
}

function replyToFromDoc(replyTo: unknown): MessageReplyRef | undefined {
  if (!replyTo || typeof replyTo !== "object") return undefined;
  const r = replyTo as {
    messageId?: unknown;
    excerpt?: unknown;
    senderId?: unknown;
  };
  const messageId = r.messageId ? String(r.messageId) : "";
  const excerpt = typeof r.excerpt === "string" ? r.excerpt : "";
  const senderId = r.senderId ? String(r.senderId) : "";
  if (!messageId || !senderId) return undefined;
  return { messageId, excerpt, senderId };
}

function disappearBlockToClient(doc: {
  disappearTtlSec?: unknown;
  disappearExpiresAt?: unknown;
  disappearStartedAt?: unknown;
}): Partial<ChatMessage> {
  const ttl = doc.disappearTtlSec;
  if (typeof ttl !== "number" || !Number.isFinite(ttl) || ttl <= 0) return {};
  const out: Partial<ChatMessage> = { disappearTtlSec: ttl };
  const exp = doc.disappearExpiresAt;
  if (exp instanceof Date) {
    const t = exp.getTime();
    if (Number.isFinite(t)) out.disappearExpiresAt = t;
  } else if (exp != null) {
    const t = new Date(exp as string | number).getTime();
    if (Number.isFinite(t)) out.disappearExpiresAt = t;
  }
  const st = doc.disappearStartedAt;
  if (st instanceof Date) {
    const t = st.getTime();
    if (Number.isFinite(t)) out.disappearStartedAt = t;
  } else if (st != null) {
    const t = new Date(st as string | number).getTime();
    if (Number.isFinite(t)) out.disappearStartedAt = t;
  }
  return out;
}

export function messageDocToClient(doc: {
  _id: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  content?: string | null;
  createdAt?: Date;
  replyTo?: unknown;
  fileUrl?: string | null;
  fileType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  reactions?: unknown;
  editedAt?: Date | null;
  deletedAt?: Date | null;
  disappearTtlSec?: unknown;
  disappearExpiresAt?: unknown;
  disappearStartedAt?: unknown;
  fromAiAgent?: boolean | null;
  isSystemNotice?: boolean | null;
  systemNoticeKind?: string | null;
  systemNoticeSeconds?: unknown;
}): ChatMessage {
  const replyTo = replyToFromDoc(doc.replyTo);
  const deleted = !!doc.deletedAt;
  if (deleted) {
    return {
      id: doc._id.toString(),
      conversationId: doc.conversationId.toString(),
      senderId: doc.senderId.toString(),
      content: "",
      createdAt: doc.createdAt?.getTime() ?? Date.now(),
      deleted: true,
      status: "sent",
      ...(replyTo ? { replyTo } : {}),
      ...disappearBlockToClient(doc),
    };
  }

  const isSys = !!doc.isSystemNotice;
  const sk = doc.systemNoticeKind;
  if (isSys && sk === "disappearing_timer") {
    const raw = doc.systemNoticeSeconds;
    const sec =
      typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : null;
    return {
      id: doc._id.toString(),
      conversationId: doc.conversationId.toString(),
      senderId: doc.senderId.toString(),
      content: "",
      createdAt: doc.createdAt?.getTime() ?? Date.now(),
      status: "sent",
      systemNotice: { kind: "disappearing_timer", seconds: sec },
    };
  }

  const fileUrl = doc.fileUrl?.trim();
  const fileType = doc.fileType ? (doc.fileType as MessageFileType) : undefined;
  const fileName = doc.fileName?.trim();
  const reactions = reactionsFromRawDoc(doc.reactions);
  const editedAtMs =
    doc.editedAt instanceof Date
      ? doc.editedAt.getTime()
      : doc.editedAt
        ? new Date(doc.editedAt as string).getTime()
        : undefined;
  const base: ChatMessage = {
    id: doc._id.toString(),
    conversationId: doc.conversationId.toString(),
    senderId: doc.senderId.toString(),
    content: doc.content ?? "",
    createdAt: doc.createdAt?.getTime() ?? Date.now(),
    status: "sent",
    ...(replyTo ? { replyTo } : {}),
    ...(reactions?.length ? { reactions } : {}),
    ...(editedAtMs != null && Number.isFinite(editedAtMs) ? { editedAt: editedAtMs } : {}),
    ...(doc.fromAiAgent ? { fromAiAgent: true } : {}),
  };
  const fs = doc.fileSize;
  const sizeOk = fs != null && Number.isFinite(fs) && fs >= 0;
  if (fileUrl && fileType) {
    return {
      ...base,
      ...disappearBlockToClient(doc),
      fileUrl,
      fileType,
      ...(fileName ? { fileName } : {}),
      ...(sizeOk ? { fileSize: fs } : {}),
    };
  }
  return { ...base, ...disappearBlockToClient(doc) };
}

export type MessageAttachmentInput = {
  fileUrl: string;
  fileType: MessageFileType;
  fileName: string;
  fileSize?: number;
};

function assertSafeUploadPublicPath(url: string): void {
  const u = url.trim();
  if (u.includes("..") || u.includes("\\")) {
    throw new Error("Invalid attachment URL");
  }
  const apiPrefix = "/api/files/";
  const legacyPrefix = "/uploads/";
  let name: string;
  if (u.startsWith(apiPrefix)) {
    name = u.slice(apiPrefix.length);
  } else if (u.startsWith(legacyPrefix)) {
    name = u.slice(legacyPrefix.length);
  } else {
    throw new Error("Invalid attachment URL");
  }
  if (!name || name.includes("/") || !isStoredUploadFileName(name)) {
    throw new Error("Invalid attachment URL");
  }
}

export type CreateMessageOptions = {
  fromAiAgent?: boolean;
};

export async function createMessage(
  conversationId: string,
  senderId: string,
  content: string,
  replyToMessageId?: string | null,
  attachment?: MessageAttachmentInput | null,
  options?: CreateMessageOptions | null
): Promise<ChatMessage> {
  const trimmed = content.trim();
  const hasAttachment =
    attachment &&
    typeof attachment.fileUrl === "string" &&
    attachment.fileUrl.trim().length > 0 &&
    attachment.fileType &&
    typeof attachment.fileName === "string";

  if (!trimmed && !hasAttachment) {
    throw new Error("Empty message");
  }
  if (trimmed.length > envMessageMaxContentLength()) {
    throw new Error("Message too long");
  }
  if (hasAttachment) {
    assertSafeUploadPublicPath(attachment!.fileUrl);
    if (attachment!.fileName.length > envMessageFileNameMax()) {
      throw new Error("File name too long");
    }
    if (!["image", "video", "pdf", "file", "audio"].includes(attachment!.fileType)) {
      throw new Error("Invalid file type");
    }
    if (
      attachment!.fileSize != null &&
      (!Number.isFinite(attachment!.fileSize) || attachment!.fileSize < 0)
    ) {
      throw new Error("Invalid file size");
    }
  }

  await assertParticipant(conversationId, senderId);
  await assertConversationMessagingAllowed(conversationId, senderId);
  await connectDB();

  const convOid = toObjectId(conversationId);
  const senderOid = toObjectId(senderId);

  const convSnap = await Conversation.findById(convOid).select("disappearingMessageSeconds").lean();
  const dmRaw = (convSnap as { disappearingMessageSeconds?: unknown } | null)?.disappearingMessageSeconds;
  const ttlPersist = normalizeStoredDisappearingSeconds(dmRaw);

  let replyTo: { messageId: mongoose.Types.ObjectId; excerpt: string; senderId: mongoose.Types.ObjectId } | undefined;
  if (replyToMessageId && mongoose.isValidObjectId(replyToMessageId)) {
    const replied = await Message.findOne({
      _id: toObjectId(replyToMessageId),
      conversationId: convOid,
    })
      .select("content senderId fileUrl fileType fileName deletedAt")
      .lean();
    if (replied) {
      const excerpt = previewFromMessageDoc(replied).slice(0, envMessageReplyExcerptMax());
      replyTo = {
        messageId: replied._id,
        excerpt,
        senderId: replied.senderId as mongoose.Types.ObjectId,
      };
    }
  }

  const msg = await Message.create({
    conversationId: convOid,
    senderId: senderOid,
    content: trimmed,
    ...(options?.fromAiAgent ? { fromAiAgent: true } : {}),
    ...(hasAttachment
      ? {
          fileUrl: attachment!.fileUrl.trim(),
          fileType: attachment!.fileType,
          fileName: attachment!.fileName.trim(),
          ...(attachment!.fileSize != null &&
          Number.isFinite(attachment!.fileSize) &&
          attachment!.fileSize >= 0
            ? { fileSize: attachment!.fileSize }
            : {}),
        }
      : {}),
    ...(replyTo ? { replyTo } : {}),
    ...(ttlPersist != null ? { disappearTtlSec: ttlPersist } : {}),
  });

  await Conversation.updateOne(
    { _id: convOid },
    { $set: { lastMessageAt: msg.createdAt ?? new Date() } }
  );

  const created = messageDocToClient({
    _id: msg._id,
    conversationId: msg.conversationId,
    senderId: msg.senderId,
    content: msg.content,
    createdAt: msg.createdAt,
    replyTo: msg.replyTo,
    fileUrl: msg.fileUrl,
    fileType: msg.fileType,
    fileName: msg.fileName,
    fileSize: msg.fileSize,
    reactions: (msg as { reactions?: unknown }).reactions,
    disappearTtlSec: (msg as { disappearTtlSec?: unknown }).disappearTtlSec,
    disappearExpiresAt: (msg as { disappearExpiresAt?: unknown }).disappearExpiresAt,
    disappearStartedAt: (msg as { disappearStartedAt?: unknown }).disappearStartedAt,
    fromAiAgent: (msg as { fromAiAgent?: boolean }).fromAiAgent,
    isSystemNotice: (msg as { isSystemNotice?: boolean }).isSystemNotice,
    systemNoticeKind: (msg as { systemNoticeKind?: string }).systemNoticeKind,
    systemNoticeSeconds: (msg as { systemNoticeSeconds?: unknown }).systemNoticeSeconds,
  });
  const [enriched] = await enrichMessagesWithReplyContext(conversationId, [created]);
  return enriched;
}

export async function toggleMessageReaction(
  conversationId: string,
  userId: string,
  messageId: string,
  emoji: string
): Promise<{ messageId: string; reactions: MessageReactionSummary[] }> {
  if (!isAllowedReactionEmoji(emoji)) {
    throw new Error("Invalid reaction");
  }
  await assertParticipant(conversationId, userId);
  await assertConversationMessagingAllowed(conversationId, userId);
  await connectDB();
  const convOid = toObjectId(conversationId);
  const msgOid = toObjectId(messageId);
  const userOid = toObjectId(userId);

  const msg = await Message.findOne({ _id: msgOid, conversationId: convOid });
  if (!msg) {
    throw new Error("Message not found");
  }

  type ReactionRow = { userId: mongoose.Types.ObjectId; emoji: string };
  const raw = ((msg as { reactions?: ReactionRow[] }).reactions ?? []) as ReactionRow[];
  const list: ReactionRow[] = raw.map((r) => ({
    userId: r.userId,
    emoji: String(r.emoji ?? "").trim(),
  }));

  const idx = list.findIndex((r) => r.userId.toString() === userId);
  if (idx !== -1 && list[idx].emoji === emoji) {
    list.splice(idx, 1);
  } else if (idx !== -1) {
    list[idx] = { userId: userOid, emoji };
  } else {
    list.push({ userId: userOid, emoji });
  }

  (msg as { reactions: ReactionRow[] }).reactions = list;
  await msg.save();

  const summaries = sortReactionSummaries(
    aggregateReactions(list.map((r) => ({ userId: r.userId.toString(), emoji: r.emoji })))
  );
  return { messageId, reactions: summaries };
}

export async function markConversationRead(
  conversationId: string,
  userId: string
): Promise<{ readAt: number; conversationId: string; didUpdate: boolean }> {
  await assertParticipant(conversationId, userId);
  await connectDB();
  const convOid = toObjectId(conversationId);
  const conv = await Conversation.findById(conversationId).select("readAtByUser participantIds").lean();
  if (!conv) {
    throw new Error("Conversation not found");
  }
  const prevRead = readAtMsFromConv((conv as { readAtByUser?: unknown }).readAtByUser, userId);

  const peerId = conv.participantIds.map((p) => p.toString()).find((p) => p !== userId);
  if (peerId && (await usersBlockEachOther(userId, peerId))) {
    return { readAt: prevRead, conversationId, didUpdate: false };
  }

  const now = new Date();
  const nowMs = now.getTime();
  /** Advance cursor whenever the client marks read; do not use a time throttle here — that blocked
   *  `conversation:read` when a new message arrived shortly after the last mark-read POST. */
  if (nowMs <= prevRead) {
    return { readAt: prevRead, conversationId, didUpdate: false };
  }

  const res = await Conversation.updateOne(
    { _id: convOid },
    { $set: { [`readAtByUser.${userId}`]: now } }
  );

  if (!res.matchedCount) {
    throw new Error("Conversation not found");
  }

  const didUpdate = res.modifiedCount > 0;
  return {
    readAt: didUpdate ? nowMs : prevRead,
    conversationId,
    didUpdate,
  };
}

export type ConversationMessagesPayload = {
  messages: ChatMessage[];
  peerReadAt: number;
  /** True when older messages exist before the oldest row in `messages`. */
  hasOlder: boolean;
};

function docToChatMessage(d: {
  _id: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  content?: string | null;
  createdAt?: Date;
  replyTo?: unknown;
  fileUrl?: string | null;
  fileType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  reactions?: unknown;
  editedAt?: Date | null;
  deletedAt?: Date | null;
  disappearTtlSec?: unknown;
  disappearExpiresAt?: unknown;
  disappearStartedAt?: unknown;
  fromAiAgent?: boolean | null;
  isSystemNotice?: boolean | null;
  systemNoticeKind?: string | null;
  systemNoticeSeconds?: unknown;
}): ChatMessage {
  return messageDocToClient({
    _id: d._id,
    conversationId: d.conversationId,
    senderId: d.senderId,
    content: d.content,
    createdAt: d.createdAt,
    replyTo: d.replyTo,
    fileUrl: d.fileUrl,
    fileType: d.fileType,
    fileName: d.fileName,
    fileSize: d.fileSize,
    reactions: d.reactions,
    editedAt: d.editedAt,
    deletedAt: d.deletedAt,
    disappearTtlSec: d.disappearTtlSec,
    disappearExpiresAt: d.disappearExpiresAt,
    disappearStartedAt: d.disappearStartedAt,
    fromAiAgent: d.fromAiAgent,
    isSystemNotice: d.isSystemNotice,
    systemNoticeKind: d.systemNoticeKind,
    systemNoticeSeconds: d.systemNoticeSeconds,
  });
}

/** Resolves reply excerpts and sender display names from referenced messages (and marks deleted refs). */
export async function enrichMessagesWithReplyContext(
  conversationId: string,
  messages: ChatMessage[]
): Promise<ChatMessage[]> {
  const replyIds = [
    ...new Set(
      messages
        .map((m) => m.replyTo?.messageId)
        .filter((id): id is string => Boolean(id && mongoose.isValidObjectId(id)))
    ),
  ];
  if (!replyIds.length) return messages;

  await connectDB();
  const convOid = toObjectId(conversationId);
  const oids = replyIds.map((id) => toObjectId(id));
  const originals = await Message.find({
    conversationId: convOid,
    _id: { $in: oids },
  })
    .select("content senderId fileUrl fileType fileName deletedAt")
    .lean();

  const origById = new Map(originals.map((d) => [d._id.toString(), d]));

  const userIdSet = new Set<string>();
  for (const m of messages) {
    if (!m.replyTo) continue;
    const orig = origById.get(m.replyTo.messageId);
    if (orig) userIdSet.add(orig.senderId.toString());
    else userIdSet.add(m.replyTo.senderId);
  }

  const userOids = Array.from(userIdSet)
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => toObjectId(id));
  const users =
    userOids.length > 0
      ? await User.find({ _id: { $in: userOids } }).select("name email").lean()
      : [];
  const labelByUser = new Map(
    users.map((u) => [u._id.toString(), u.name?.trim() || u.email || "Unknown"])
  );

  return messages.map((m) => {
    if (!m.replyTo) return m;
    const orig = origById.get(m.replyTo.messageId);
    if (!orig) {
      const senderLabel = labelByUser.get(m.replyTo.senderId) ?? "Unknown";
      const deletedRef: MessageReplyRef = {
        messageId: m.replyTo.messageId,
        senderId: m.replyTo.senderId,
        excerpt: "",
        deleted: true,
        senderLabel,
      };
      return { ...m, replyTo: deletedRef };
    }
    const origSenderLabel = labelByUser.get(orig.senderId.toString()) ?? "Unknown";
    const origDeleted = !!(orig as { deletedAt?: Date | null }).deletedAt;
    if (origDeleted) {
      const deletedRef: MessageReplyRef = {
        messageId: m.replyTo.messageId,
        senderId: orig.senderId.toString(),
        excerpt: "",
        deleted: true,
        senderLabel: origSenderLabel,
      };
      return { ...m, replyTo: deletedRef };
    }
    const nextRef: MessageReplyRef = {
      messageId: m.replyTo.messageId,
      senderId: orig.senderId.toString(),
      excerpt: previewFromMessageDoc(orig).slice(0, envMessageReplyExcerptMax()),
      senderLabel: origSenderLabel,
      replyMediaType: orig.fileType ? (orig.fileType as MessageFileType) : undefined,
    };
    return { ...m, replyTo: nextRef };
  });
}

export async function listMessagesForConversation(
  conversationId: string,
  userId: string
): Promise<ConversationMessagesPayload> {
  await assertParticipant(conversationId, userId);
  await connectDB();

  const conv = await Conversation.findById(conversationId).lean();
  if (!conv) {
    throw new Error("Conversation not found");
  }
  const pids = conv.participantIds.map((p) => p.toString());
  const otherId = pids.find((p) => p !== userId) ?? "";
  const peerReadAt = otherId ? readAtMsFromConv((conv as { readAtByUser?: unknown }).readAtByUser, otherId) : 0;

  const convOid = toObjectId(conversationId);
  const docs = await Message.find({ conversationId: convOid })
    .sort({ createdAt: -1 })
    .limit(envMessageListInitialLimit())
    .lean();

  const chronological = [...docs].reverse();
  const rawMessages = chronological.map((d) => docToChatMessage(d));
  const messages = await enrichMessagesWithReplyContext(conversationId, rawMessages);

  let hasOlder = false;
  if (docs.length > 0) {
    const oldest = docs[docs.length - 1]!.createdAt;
    const oldestAt = oldest instanceof Date ? oldest : new Date(oldest as string);
    hasOlder = !!(await Message.exists({
      conversationId: convOid,
      createdAt: { $lt: oldestAt },
    }));
  }

  return { messages, peerReadAt, hasOlder };
}

/** Last N messages (chronological) for AI persona context — smaller cap than full thread load. */
export async function listRecentMessagesForPersona(
  conversationId: string,
  userId: string,
  limit = 60
): Promise<ChatMessage[]> {
  await assertParticipant(conversationId, userId);
  await connectDB();

  const convOid = toObjectId(conversationId);
  const lim = Math.min(Math.max(Math.floor(limit), 5), 60);
  const docs = await Message.find({ conversationId: convOid })
    .sort({ createdAt: -1 })
    .limit(lim)
    .lean();

  const chronological = [...docs].reverse();
  const rawMessages = chronological.map((d) => docToChatMessage(d));
  return enrichMessagesWithReplyContext(conversationId, rawMessages);
}

/**
 * Loads older messages strictly before the given anchor message (by `createdAt` cursor).
 */
export async function listMessagesBeforeMessageId(
  conversationId: string,
  userId: string,
  beforeMessageId: string,
  limit?: number
): Promise<{ messages: ChatMessage[]; hasOlder: boolean }> {
  await assertParticipant(conversationId, userId);
  await connectDB();

  const convOid = toObjectId(conversationId);
  const beforeOid = toObjectId(beforeMessageId);

  const anchor = await Message.findOne({ _id: beforeOid, conversationId: convOid }).select("createdAt").lean();
  if (!anchor?.createdAt) {
    return { messages: [], hasOlder: false };
  }

  const anchorAt = anchor.createdAt instanceof Date ? anchor.createdAt : new Date(anchor.createdAt as string);
  const rawLimit = limit ?? envMessageListOlderPageDefault();
  const pageLimit = Math.min(
    Math.max(Math.floor(rawLimit), 1),
    envMessageListOlderPageMax()
  );

  const older = await Message.find({
    conversationId: convOid,
    createdAt: { $lt: anchorAt },
  })
    .sort({ createdAt: -1 })
    .limit(pageLimit + 1)
    .lean();

  const batchHasMore = older.length > pageLimit;
  const slice = batchHasMore ? older.slice(0, pageLimit) : older;
  const chronological = [...slice].reverse();
  const rawPage = chronological.map((d) => docToChatMessage(d));
  const messages = await enrichMessagesWithReplyContext(conversationId, rawPage);

  let hasOlder = batchHasMore;
  if (!hasOlder && slice.length > 0) {
    const oldest = slice[slice.length - 1]!.createdAt;
    const oldestAt = oldest instanceof Date ? oldest : new Date(oldest as string);
    hasOlder = !!(await Message.exists({
      conversationId: convOid,
      createdAt: { $lt: oldestAt },
    }));
  }

  return { messages, hasOlder };
}

export async function findUserIdByEmail(email: string): Promise<string | null> {
  await connectDB();
  const user = await User.findOne({ email: email.trim().toLowerCase() }).lean();
  return user ? user._id.toString() : null;
}

export async function editMessage(
  conversationId: string,
  userId: string,
  messageId: string,
  content: string
): Promise<ChatMessage> {
  const trimmed = content.trim();
  await assertParticipant(conversationId, userId);
  await assertConversationMessagingAllowed(conversationId, userId);
  await connectDB();
  const convOid = toObjectId(conversationId);
  const msgOid = toObjectId(messageId);

  const msg = await Message.findOne({ _id: msgOid, conversationId: convOid });
  if (!msg) {
    throw new Error("Message not found");
  }
  if (msg.senderId.toString() !== userId) {
    throw new Error("Forbidden");
  }
  if (msg.deletedAt) {
    throw new Error("Message deleted");
  }
  if ((msg as { isSystemNotice?: boolean }).isSystemNotice) {
    throw new Error("Forbidden");
  }

  const createdMs =
    msg.createdAt instanceof Date ? msg.createdAt.getTime() : new Date(msg.createdAt as string).getTime();
  if (!Number.isFinite(createdMs) || Date.now() - createdMs > MESSAGE_EDIT_WINDOW_MS) {
    throw new Error("Edit window expired");
  }

  const hasFile =
    typeof msg.fileUrl === "string" &&
    msg.fileUrl.trim().length > 0 &&
    typeof msg.fileType === "string";

  if (!trimmed && !hasFile) {
    throw new Error("Empty message");
  }
  if (trimmed.length > envMessageMaxContentLength()) {
    throw new Error("Message too long");
  }

  msg.content = trimmed;
  msg.editedAt = new Date();
  await msg.save();

  const client = messageDocToClient({
    _id: msg._id,
    conversationId: msg.conversationId,
    senderId: msg.senderId,
    content: msg.content,
    createdAt: msg.createdAt,
    editedAt: msg.editedAt,
    deletedAt: msg.deletedAt,
    replyTo: msg.replyTo,
    fileUrl: msg.fileUrl,
    fileType: msg.fileType,
    fileName: msg.fileName,
    fileSize: msg.fileSize,
    reactions: (msg as { reactions?: unknown }).reactions,
    disappearTtlSec: (msg as { disappearTtlSec?: unknown }).disappearTtlSec,
    disappearExpiresAt: (msg as { disappearExpiresAt?: unknown }).disappearExpiresAt,
    disappearStartedAt: (msg as { disappearStartedAt?: unknown }).disappearStartedAt,
    isSystemNotice: (msg as { isSystemNotice?: boolean }).isSystemNotice,
    systemNoticeKind: (msg as { systemNoticeKind?: string }).systemNoticeKind,
    systemNoticeSeconds: (msg as { systemNoticeSeconds?: unknown }).systemNoticeSeconds,
    fromAiAgent: (msg as { fromAiAgent?: boolean }).fromAiAgent,
  });
  const [enriched] = await enrichMessagesWithReplyContext(conversationId, [client]);
  return enriched;
}

export async function softDeleteMessage(
  conversationId: string,
  userId: string,
  messageId: string
): Promise<ChatMessage> {
  await assertParticipant(conversationId, userId);
  await assertConversationMessagingAllowed(conversationId, userId);
  await connectDB();
  const convOid = toObjectId(conversationId);
  const msgOid = toObjectId(messageId);

  const msg = await Message.findOne({ _id: msgOid, conversationId: convOid });
  if (!msg) {
    throw new Error("Message not found");
  }
  if (msg.senderId.toString() !== userId) {
    throw new Error("Forbidden");
  }
  if (msg.deletedAt) {
    throw new Error("Already deleted");
  }
  if ((msg as { isSystemNotice?: boolean }).isSystemNotice) {
    throw new Error("Forbidden");
  }

  msg.deletedAt = new Date();
  msg.content = "";
  msg.fileUrl = undefined;
  msg.fileType = undefined;
  msg.fileName = undefined;
  msg.fileSize = undefined;
  (msg as { reactions: unknown[] }).reactions = [];
  await msg.save();

  const client = messageDocToClient({
    _id: msg._id,
    conversationId: msg.conversationId,
    senderId: msg.senderId,
    content: msg.content,
    createdAt: msg.createdAt,
    editedAt: undefined,
    deletedAt: msg.deletedAt,
    replyTo: msg.replyTo,
    fileUrl: msg.fileUrl,
    fileType: msg.fileType,
    fileName: msg.fileName,
    fileSize: msg.fileSize,
    reactions: [],
    disappearTtlSec: (msg as { disappearTtlSec?: unknown }).disappearTtlSec,
    disappearExpiresAt: (msg as { disappearExpiresAt?: unknown }).disappearExpiresAt,
    disappearStartedAt: (msg as { disappearStartedAt?: unknown }).disappearStartedAt,
    fromAiAgent: (msg as { fromAiAgent?: boolean }).fromAiAgent,
    isSystemNotice: (msg as { isSystemNotice?: boolean }).isSystemNotice,
    systemNoticeKind: (msg as { systemNoticeKind?: string }).systemNoticeKind,
    systemNoticeSeconds: (msg as { systemNoticeSeconds?: unknown }).systemNoticeSeconds,
  });
  const [enriched] = await enrichMessagesWithReplyContext(conversationId, [client]);
  return enriched;
}

export type DisappearScheduleUpdate = {
  id: string;
  disappearExpiresAt: number;
  disappearStartedAt: number;
};

export async function setConversationDisappearingSeconds(
  conversationId: string,
  userId: string,
  seconds: number | null
): Promise<number | null> {
  await assertParticipant(conversationId, userId);
  await assertConversationMessagingAllowed(conversationId, userId);
  await connectDB();
  const normalized = seconds == null || seconds === 0 ? null : seconds;
  if (normalized !== null && !isAllowedDisappearingTtlSec(normalized)) {
    throw new Error("Invalid disappearing timer");
  }
  const cid = toObjectId(conversationId);
  if (normalized === null) {
    await Conversation.updateOne({ _id: cid }, { $unset: { disappearingMessageSeconds: "" } });
  } else {
    await Conversation.updateOne({ _id: cid }, { $set: { disappearingMessageSeconds: normalized } });
  }
  return normalized;
}

export async function createDisappearingTimerSystemNotice(
  conversationId: string,
  actorUserId: string,
  seconds: number | null
): Promise<ChatMessage> {
  await assertParticipant(conversationId, actorUserId);
  await assertConversationMessagingAllowed(conversationId, actorUserId);
  await connectDB();
  const convOid = toObjectId(conversationId);
  const actorOid = toObjectId(actorUserId);

  const msg = await Message.create({
    conversationId: convOid,
    senderId: actorOid,
    content: "",
    isSystemNotice: true,
    systemNoticeKind: "disappearing_timer",
    systemNoticeSeconds: seconds,
  });

  await Conversation.updateOne(
    { _id: convOid },
    { $set: { lastMessageAt: msg.createdAt ?? new Date() } }
  );

  return messageDocToClient({
    _id: msg._id,
    conversationId: msg.conversationId,
    senderId: msg.senderId,
    content: "",
    createdAt: msg.createdAt,
    replyTo: msg.replyTo,
    fileUrl: msg.fileUrl,
    fileType: msg.fileType,
    fileName: msg.fileName,
    fileSize: msg.fileSize,
    reactions: (msg as { reactions?: unknown }).reactions,
    isSystemNotice: true,
    systemNoticeKind: "disappearing_timer",
    systemNoticeSeconds: seconds,
  });
}

export async function scheduleDisappearingForMessagesReadBy(
  conversationId: string,
  readerUserId: string,
  readAt: Date
): Promise<DisappearScheduleUpdate[]> {
  await connectDB();
  const convOid = toObjectId(conversationId);
  const readerOid = toObjectId(readerUserId);
  const readMs = readAt.getTime();

  const docs = await Message.find({
    conversationId: convOid,
    senderId: { $ne: readerOid },
    isSystemNotice: { $ne: true },
    disappearTtlSec: { $gt: 0 },
    $or: [{ disappearExpiresAt: null }, { disappearExpiresAt: { $exists: false } }],
    deletedAt: null,
    createdAt: { $lte: readAt },
  })
    .select("_id disappearTtlSec")
    .lean();

  const updates: DisappearScheduleUpdate[] = [];
  for (const m of docs) {
    const ttl = m.disappearTtlSec as number;
    if (typeof ttl !== "number" || !Number.isFinite(ttl) || ttl <= 0) continue;
    const expiresAt = new Date(readMs + ttl * 1000);
    const res = await Message.updateOne(
      {
        _id: m._id,
        $or: [{ disappearExpiresAt: null }, { disappearExpiresAt: { $exists: false } }],
      },
      { $set: { disappearExpiresAt: expiresAt, disappearStartedAt: readAt } }
    );
    if (res.modifiedCount > 0) {
      updates.push({
        id: m._id.toString(),
        disappearExpiresAt: expiresAt.getTime(),
        disappearStartedAt: readMs,
      });
    }
  }
  return updates;
}

export type PurgedMessagesBatch = { conversationId: string; messageIds: string[] };

/**
 * Max forward skew when the client POSTs a targeted sweep: allows delete if the server clock is
 * behind the browser (client timer fired while Mongo `disappearExpiresAt` is still slightly future).
 */
const DISAPPEAR_TARGETED_SLACK_MS = 15_000;

/** Cutoff for targeted purge-by-id: `disappearExpiresAt` must be at or before this instant. */
function disappearTargetedPurgeCutoff(): Date {
  return new Date(Date.now() + DISAPPEAR_TARGETED_SLACK_MS);
}

/** Cutoff for global "already expired" purge — must be wall time, not future, or TTLs end early. */
function disappearExpiredWallClockCutoff(): Date {
  return new Date();
}

async function recomputeConversationLastMessageAt(conversationId: string): Promise<void> {
  await connectDB();
  const convOid = toObjectId(conversationId);
  const lastMsg = await Message.findOne({
    conversationId: convOid,
    deletedAt: null,
  })
    .sort({ createdAt: -1 })
    .select("createdAt")
    .lean();
  if (lastMsg?.createdAt) {
    const at = lastMsg.createdAt instanceof Date ? lastMsg.createdAt : new Date(lastMsg.createdAt as string);
    await Conversation.updateOne({ _id: convOid }, { $set: { lastMessageAt: at } });
  } else {
    await Conversation.updateOne({ _id: convOid }, { $unset: { lastMessageAt: "" } });
  }
}

export async function purgeExpiredDisappearingMessages(): Promise<PurgedMessagesBatch[]> {
  await connectDB();
  const cutoff = disappearExpiredWallClockCutoff();
  const expired = await Message.find({
    disappearExpiresAt: { $lte: cutoff },
    disappearTtlSec: { $gt: 0 },
  })
    .select("_id conversationId fileUrl")
    .lean();

  const byConv = new Map<string, string[]>();
  for (const doc of expired) {
    const cid = doc.conversationId.toString();
    if (!byConv.has(cid)) byConv.set(cid, []);
    byConv.get(cid)!.push(doc._id.toString());
    await tryDeleteStoredUploadPublicUrl(typeof doc.fileUrl === "string" ? doc.fileUrl : undefined);
    await Message.deleteOne({ _id: doc._id });
  }

  const batches: PurgedMessagesBatch[] = [];
  for (const [cid, ids] of byConv) {
    await recomputeConversationLastMessageAt(cid);
    batches.push({ conversationId: cid, messageIds: ids });
  }
  return batches;
}

export async function purgeExpiredDisappearingMessagesInConversation(
  conversationId: string,
  userId: string
): Promise<PurgedMessagesBatch | null> {
  await assertParticipant(conversationId, userId);
  await connectDB();
  const convOid = toObjectId(conversationId);
  const cutoff = disappearExpiredWallClockCutoff();
  const expired = await Message.find({
    conversationId: convOid,
    disappearExpiresAt: { $lte: cutoff },
    disappearTtlSec: { $gt: 0 },
  })
    .select("_id fileUrl")
    .lean();
  if (!expired.length) return null;
  const ids: string[] = [];
  for (const doc of expired) {
    ids.push(doc._id.toString());
    await tryDeleteStoredUploadPublicUrl(typeof doc.fileUrl === "string" ? doc.fileUrl : undefined);
    await Message.deleteOne({ _id: doc._id });
  }
  await recomputeConversationLastMessageAt(conversationId);
  return { conversationId, messageIds: ids };
}

/**
 * Deletes specific disappearing messages when the client reports expiry (clock-skew tolerant).
 */
export async function purgeDisappearingMessagesByIdsInConversation(
  conversationId: string,
  userId: string,
  messageIds: string[]
): Promise<PurgedMessagesBatch | null> {
  await assertParticipant(conversationId, userId);
  await connectDB();
  const convOid = toObjectId(conversationId);
  const oids = messageIds.filter((id) => mongoose.isValidObjectId(id)).map((id) => toObjectId(id));
  if (!oids.length) return null;
  const cutoff = disappearTargetedPurgeCutoff();
  const docs = await Message.find({
    _id: { $in: oids },
    conversationId: convOid,
    disappearTtlSec: { $gt: 0 },
    disappearExpiresAt: { $lte: cutoff },
  })
    .select("_id fileUrl")
    .lean();
  if (!docs.length) return null;
  const ids: string[] = [];
  for (const doc of docs) {
    ids.push(doc._id.toString());
    await tryDeleteStoredUploadPublicUrl(typeof doc.fileUrl === "string" ? doc.fileUrl : undefined);
    await Message.deleteOne({ _id: doc._id });
  }
  await recomputeConversationLastMessageAt(conversationId);
  return { conversationId, messageIds: ids };
}
