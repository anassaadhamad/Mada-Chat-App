import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { Conversation } from "@/server/models/Conversation";
import { User } from "@/server/models/User";
import { getSocketIOServer } from "@/lib/socket-io-bridge";
import { devLog } from "@/lib/server-logger";

function toObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.isValidObjectId(id)) {
    throw new Error("Invalid id");
  }
  return new mongoose.Types.ObjectId(id);
}

export async function getOtherParticipantId(conversationId: string, userId: string): Promise<string> {
  await connectDB();
  const conv = await Conversation.findById(conversationId).select("participantIds").lean();
  if (!conv?.participantIds?.length) {
    throw new Error("Conversation not found");
  }
  const other = conv.participantIds.map((p) => p.toString()).find((p) => p !== userId);
  if (!other) {
    throw new Error("Conversation not found");
  }
  return other;
}

export async function usersBlockEachOther(userIdA: string, userIdB: string): Promise<boolean> {
  if (userIdA === userIdB) return false;
  await connectDB();
  const [ua, ub] = await Promise.all([
    User.findById(toObjectId(userIdA)).select("blockedUserIds").lean(),
    User.findById(toObjectId(userIdB)).select("blockedUserIds").lean(),
  ]);
  const aBlocks = (ua?.blockedUserIds ?? []).some((x) => x.toString() === userIdB);
  const bBlocks = (ub?.blockedUserIds ?? []).some((x) => x.toString() === userIdA);
  return aBlocks || bBlocks;
}

export async function assertConversationMessagingAllowed(
  conversationId: string,
  userId: string
): Promise<void> {
  const peer = await getOtherParticipantId(conversationId, userId);
  if (await usersBlockEachOther(userId, peer)) {
    throw new Error("Blocked");
  }
}

function directKeyForPair(userIdA: string, userIdB: string): string {
  const [a, b] = [userIdA, userIdB].sort();
  return `${a}:${b}`;
}

export async function directConversationIdForPair(
  userIdA: string,
  userIdB: string
): Promise<string | null> {
  await connectDB();
  const key = directKeyForPair(userIdA, userIdB);
  const conv = await Conversation.findOne({ directKey: key }).select("_id").lean();
  return conv?._id?.toString() ?? null;
}

export type UserBlockSocketPayload = {
  conversationId: string | null;
  blockerId: string;
  blockedUserId: string;
  blocked: boolean;
};

export function emitUserBlockedToPair(payload: UserBlockSocketPayload): void {
  const io = getSocketIOServer();
  if (!io) return;
  io.to(`user:${payload.blockerId}`).emit("user:blocked", payload);
  io.to(`user:${payload.blockedUserId}`).emit("user:blocked", payload);
  devLog(
    `[block] emit user:blocked blocked=${payload.blocked} conv=${payload.conversationId ?? "none"}`
  );
}

/**
 * Sets whether `blockerId` blocks `targetUserId`. Only the blocker can unblock their own block.
 */
export async function setUserBlocked(
  blockerId: string,
  targetUserId: string,
  blocked: boolean
): Promise<{ conversationId: string | null }> {
  if (blockerId === targetUserId) {
    throw new Error("Cannot block yourself");
  }
  await connectDB();
  const blockerOid = toObjectId(blockerId);
  const targetOid = toObjectId(targetUserId);

  const blockerExists = await User.exists({ _id: blockerOid });
  const targetExists = await User.exists({ _id: targetOid });
  if (!blockerExists || !targetExists) {
    throw new Error("User not found");
  }

  if (blocked) {
    await User.updateOne({ _id: blockerOid }, { $addToSet: { blockedUserIds: targetOid } });
  } else {
    await User.updateOne({ _id: blockerOid }, { $pull: { blockedUserIds: targetOid } });
  }

  const conversationId = await directConversationIdForPair(blockerId, targetUserId);
  emitUserBlockedToPair({
    conversationId,
    blockerId,
    blockedUserId: targetUserId,
    blocked,
  });

  return { conversationId };
}
