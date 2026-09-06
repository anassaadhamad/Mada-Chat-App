import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { envAdminUserConversationsMax } from "@/lib/env-server";
import { User } from "@/server/models/User";
import { Conversation } from "@/server/models/Conversation";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function listAdminUsers(params: {
  search?: string;
  sortBy: "createdAt" | "email" | "lastSeenAt";
  order: 1 | -1;
  skip: number;
  limit: number;
}): Promise<{
  total: number;
  users: {
    id: string;
    email: string;
    name: string | null;
    role: "USER" | "ADMIN";
    suspended: boolean;
    suspendedAt: number | null;
    createdAt: number;
    lastSeenAt: number | null;
    image: string | null;
  }[];
}> {
  await connectDB();
  const q: Record<string, unknown> = {};
  if (params.search?.trim()) {
    const s = params.search.trim();
    q.$or = [
      { email: new RegExp(escapeRegex(s), "i") },
      { name: new RegExp(escapeRegex(s), "i") },
    ];
  }
  const sort: Record<string, 1 | -1> = { [params.sortBy]: params.order };
  const [users, total] = await Promise.all([
    User.find(q)
      .select("email name role suspendedAt createdAt lastSeenAt image")
      .sort(sort)
      .skip(params.skip)
      .limit(params.limit)
      .lean(),
    User.countDocuments(q),
  ]);
  return {
    total,
    users: users.map((u) => ({
      id: u._id.toString(),
      email: u.email,
      name: u.name ?? null,
      role: (u.role === "ADMIN" ? "ADMIN" : "USER") as "USER" | "ADMIN",
      suspended: !!u.suspendedAt,
      suspendedAt: u.suspendedAt instanceof Date ? u.suspendedAt.getTime() : null,
      createdAt: u.createdAt instanceof Date ? u.createdAt.getTime() : Date.now(),
      lastSeenAt: u.lastSeenAt instanceof Date ? u.lastSeenAt.getTime() : null,
      image: u.image ?? null,
    })),
  };
}

export async function adminUpdateUser(
  targetId: string,
  patch: { suspended?: boolean; role?: "USER" | "ADMIN" },
  actorAdminId: string
): Promise<void> {
  if (!mongoose.isValidObjectId(targetId)) {
    throw new Error("Invalid user id");
  }
  if (patch.suspended === true && targetId === actorAdminId) {
    throw new Error("Cannot suspend your own account");
  }

  await connectDB();

  if (patch.role === "USER") {
    const target = await User.findById(targetId).select("role").lean();
    if (target?.role === "ADMIN") {
      const otherActiveAdmins = await User.countDocuments({
        role: "ADMIN",
        $or: [{ suspendedAt: null }, { suspendedAt: { $exists: false } }],
        _id: { $ne: new mongoose.Types.ObjectId(targetId) },
      });
      if (otherActiveAdmins === 0) {
        throw new Error("Cannot remove the last active administrator");
      }
    }
  }

  const update: Record<string, unknown> = {};
  if (patch.suspended === true) {
    update.suspendedAt = new Date();
  } else if (patch.suspended === false) {
    update.suspendedAt = null;
  }
  if (patch.role === "USER" || patch.role === "ADMIN") {
    update.role = patch.role;
  }

  if (Object.keys(update).length === 0) {
    throw new Error("No changes");
  }

  const res = await User.updateOne({ _id: new mongoose.Types.ObjectId(targetId) }, { $set: update });
  if (res.matchedCount === 0) {
    throw new Error("User not found");
  }
}

export async function listUserConversationsForAdmin(targetUserId: string): Promise<
  {
    id: string;
    directKey: string | null;
    peerUserId: string | null;
    peerEmail: string | null;
    peerName: string | null;
    lastMessageAt: number | null;
    createdAt: number;
  }[]
> {
  if (!mongoose.isValidObjectId(targetUserId)) {
    throw new Error("Invalid user id");
  }
  await connectDB();
  const oid = new mongoose.Types.ObjectId(targetUserId);
  const convs = await Conversation.find({ participantIds: oid })
    .select("participantIds directKey lastMessageAt createdAt")
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .limit(envAdminUserConversationsMax())
    .lean();

  const out: Awaited<ReturnType<typeof listUserConversationsForAdmin>> = [];
  for (const c of convs) {
    const parts = (c.participantIds ?? []).map((p) => p.toString());
    const peerId = parts.find((p) => p !== targetUserId) ?? null;
    let peerEmail: string | null = null;
    let peerName: string | null = null;
    if (peerId && mongoose.isValidObjectId(peerId)) {
      const peer = await User.findById(peerId).select("email name").lean();
      peerEmail = peer?.email ?? null;
      peerName = peer?.name ?? null;
    }
    out.push({
      id: c._id.toString(),
      directKey: c.directKey ?? null,
      peerUserId: peerId,
      peerEmail,
      peerName,
      lastMessageAt: c.lastMessageAt instanceof Date ? c.lastMessageAt.getTime() : null,
      createdAt: c.createdAt instanceof Date ? c.createdAt.getTime() : Date.now(),
    });
  }
  return out;
}
