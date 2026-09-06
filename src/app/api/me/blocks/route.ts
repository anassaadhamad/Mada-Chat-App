import { NextResponse } from "next/server";
import { requireActiveUser } from "@/server/require-active-user";
import mongoose from "mongoose";
import { setUserBlocked } from "@/server/blocking.service";
import { listBlockedUsers } from "@/server/me-profile.service";

export async function GET() {
  const gate = await requireActiveUser();
  if (!gate.ok) return gate.response;
  try {
    const blocked = await listBlockedUsers(gate.userId);
    return NextResponse.json({ blocked });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to load blocked users" }, { status: 500 });
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

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const targetUserId = String((body as { targetUserId?: unknown }).targetUserId ?? "").trim();
  const blockedRaw = (body as { blocked?: unknown }).blocked;
  const blocked = blockedRaw === true;

  if (!targetUserId || !mongoose.isValidObjectId(targetUserId)) {
    return NextResponse.json({ error: "Invalid targetUserId" }, { status: 400 });
  }
  if (blockedRaw !== true && blockedRaw !== false) {
    return NextResponse.json({ error: "blocked must be true or false" }, { status: 400 });
  }

  try {
    const { conversationId } = await setUserBlocked(userId, targetUserId, blocked);
    return NextResponse.json({ ok: true, conversationId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Cannot block yourself") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg === "User not found") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to update block" }, { status: 500 });
  }
}
