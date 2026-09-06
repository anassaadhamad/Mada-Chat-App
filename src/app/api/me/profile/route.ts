import { NextResponse } from "next/server";
import { requireActiveUser } from "@/server/require-active-user";
import { getMeProfile, updateMeProfile } from "@/server/me-profile.service";
import { notifyPeersProfileUpdated } from "@/lib/socket-io-bridge";

export async function GET() {
  const gate = await requireActiveUser();
  if (!gate.ok) return gate.response;
  try {
    const profile = await getMeProfile(gate.userId);
    return NextResponse.json(profile);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "User not found") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const gate = await requireActiveUser();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const patch: { name?: string; bio?: string; image?: string | null } = {};
  if ("name" in body) patch.name = String((body as { name: unknown }).name ?? "");
  if ("bio" in body) patch.bio = String((body as { bio: unknown }).bio ?? "");
  if ("image" in body) {
    const im = (body as { image: unknown }).image;
    patch.image = im === null ? null : String(im ?? "");
  }

  try {
    const profile = await updateMeProfile(gate.userId, patch);
    void notifyPeersProfileUpdated(gate.userId);
    return NextResponse.json(profile);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Name too long" || msg === "Bio too long" || msg === "Invalid image URL") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg === "User not found") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
