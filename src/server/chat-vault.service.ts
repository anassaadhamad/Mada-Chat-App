import mongoose from "mongoose";
import { compare, hash } from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/server/models/User";

const BCRYPT_ROUNDS = 10;

export function isValidChatVaultPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export async function isChatVaultConfigured(userId: string): Promise<boolean> {
  await connectDB();
  if (!mongoose.isValidObjectId(userId)) return false;
  const u = await User.findById(userId).select("+chatVaultPinHash").lean();
  const h = (u as { chatVaultPinHash?: string | null } | null)?.chatVaultPinHash;
  return typeof h === "string" && h.length > 0;
}

export async function setChatVaultPin(
  userId: string,
  pin: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isValidChatVaultPin(pin)) {
    return { ok: false, error: "PIN must be exactly 4 digits" };
  }
  await connectDB();
  if (!mongoose.isValidObjectId(userId)) {
    return { ok: false, error: "Invalid user" };
  }
  const oid = new mongoose.Types.ObjectId(userId);
  const existing = await User.findById(oid).select("+chatVaultPinHash").lean();
  if (!existing) {
    return { ok: false, error: "User not found" };
  }
  const prev = (existing as { chatVaultPinHash?: string | null }).chatVaultPinHash;
  if (prev) {
    return { ok: false, error: "PIN already configured" };
  }
  const chatVaultPinHash = await hash(pin, BCRYPT_ROUNDS);
  await User.updateOne({ _id: oid }, { $set: { chatVaultPinHash } });
  return { ok: true };
}

export async function verifyChatVaultPin(userId: string, pin: string): Promise<boolean> {
  if (!isValidChatVaultPin(pin)) return false;
  await connectDB();
  if (!mongoose.isValidObjectId(userId)) return false;
  const u = await User.findById(userId).select("+chatVaultPinHash").lean();
  const stored = (u as { chatVaultPinHash?: string | null } | null)?.chatVaultPinHash;
  if (!stored) return false;
  return compare(pin, stored);
}

export async function changeChatVaultPin(
  userId: string,
  oldPin: string,
  newPin: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isValidChatVaultPin(oldPin) || !isValidChatVaultPin(newPin)) {
    return { ok: false, error: "PIN must be exactly 4 digits" };
  }
  if (oldPin === newPin) {
    return { ok: false, error: "New PIN must be different from your current PIN" };
  }
  await connectDB();
  if (!mongoose.isValidObjectId(userId)) {
    return { ok: false, error: "Invalid user" };
  }
  const oid = new mongoose.Types.ObjectId(userId);
  const existing = await User.findById(oid).select("+chatVaultPinHash").lean();
  if (!existing) {
    return { ok: false, error: "User not found" };
  }
  const stored = (existing as { chatVaultPinHash?: string | null }).chatVaultPinHash;
  if (!stored) {
    return { ok: false, error: "PIN not configured" };
  }
  const oldOk = await compare(oldPin, stored);
  if (!oldOk) {
    return { ok: false, error: "Wrong PIN" };
  }
  const chatVaultPinHash = await hash(newPin, BCRYPT_ROUNDS);
  await User.updateOne({ _id: oid }, { $set: { chatVaultPinHash } });
  return { ok: true };
}
