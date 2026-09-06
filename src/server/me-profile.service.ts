import { compare, hash } from "bcryptjs";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/server/models/User";

const NAME_MAX = 120;
const BIO_MAX = 500;

export type MeProfileDTO = {
  id: string;
  email: string;
  name: string | null;
  bio: string;
  image: string | null;
  hasPassword: boolean;
};

export async function getMeProfile(userId: string): Promise<MeProfileDTO> {
  await connectDB();
  const u = await User.findById(userId).select("+passwordHash name email image bio deletedAt").lean();
  if (!u || u.deletedAt) {
    throw new Error("User not found");
  }
  return {
    id: u._id.toString(),
    email: u.email,
    name: u.name ?? null,
    bio: typeof u.bio === "string" ? u.bio : "",
    image: u.image ?? null,
    hasPassword: typeof u.passwordHash === "string" && u.passwordHash.length > 0,
  };
}

function assertImageUrl(image: string | null): void {
  if (image == null || image === "") return;
  const s = image.trim();
  if (s.startsWith("/api/files/") || s.startsWith("/uploads/")) return;
  try {
    const u = new URL(s);
    if (u.protocol === "https:") return;
    if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return;
  } catch {
    throw new Error("Invalid image URL");
  }
  throw new Error("Invalid image URL");
}

export async function updateMeProfile(
  userId: string,
  patch: { name?: string; bio?: string; image?: string | null }
): Promise<MeProfileDTO> {
  await connectDB();
  const set: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (n.length > NAME_MAX) throw new Error("Name too long");
    set.name = n || null;
  }
  if (patch.bio !== undefined) {
    const b = patch.bio.trim();
    if (b.length > BIO_MAX) throw new Error("Bio too long");
    set.bio = b;
  }
  if (patch.image !== undefined) {
    const img = patch.image === null ? null : patch.image.trim() || null;
    assertImageUrl(img);
    set.image = img;
  }
  if (Object.keys(set).length === 0) {
    return getMeProfile(userId);
  }
  const res = await User.updateOne({ _id: userId, deletedAt: null }, { $set: set });
  if (res.matchedCount === 0) throw new Error("User not found");
  return getMeProfile(userId);
}

export async function changePassword(
  userId: string,
  oldPassword: string,
  newPassword: string,
  minLen: number
): Promise<void> {
  if (newPassword.length < minLen) {
    throw new Error("Password too short");
  }
  if (newPassword.length > 128) {
    throw new Error("Password too long");
  }
  await connectDB();
  const u = await User.findById(userId).select("+passwordHash").lean();
  if (!u?.passwordHash) {
    throw new Error("Password login not enabled for this account");
  }
  const ok = await compare(oldPassword, u.passwordHash);
  if (!ok) throw new Error("Current password incorrect");
  const nextHash = await hash(newPassword, 12);
  await User.updateOne({ _id: userId }, { $set: { passwordHash: nextHash } });
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await connectDB();
  await User.updateOne({ _id: userId }, { $inc: { sessionRevision: 1 } });
}

export async function deleteAccount(userId: string): Promise<void> {
  await connectDB();
  const oid = new mongoose.Types.ObjectId(userId);
  const junkEmail = `deleted.${oid.toString()}.${Date.now()}@invalid.local`;
  await User.updateOne(
    { _id: oid },
    {
      $set: {
        deletedAt: new Date(),
        suspendedAt: new Date(),
        email: junkEmail,
        name: "Deleted user",
        bio: "",
        image: null,
        passwordHash: null,
        pushSubscriptions: [],
        blockedUserIds: [],
        "preferences.chatWallpaper": "",
      },
      $inc: { sessionRevision: 1 },
    }
  );
}

export type BlockedUserRow = { id: string; name: string | null; email: string };

export async function listBlockedUsers(userId: string): Promise<BlockedUserRow[]> {
  await connectDB();
  const me = await User.findById(userId).select("blockedUserIds").lean();
  const ids = (me?.blockedUserIds ?? []) as mongoose.Types.ObjectId[];
  if (ids.length === 0) return [];
  const targets = await User.find({ _id: { $in: ids } }).select("name email").lean();
  return targets.map((x) => ({
    id: x._id.toString(),
    name: x.name ?? null,
    email: x.email ?? "",
  }));
}
