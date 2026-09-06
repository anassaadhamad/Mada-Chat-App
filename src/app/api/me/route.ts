import { NextResponse } from "next/server";
import { requireActiveUser } from "@/server/require-active-user";
import { getUserPreferences } from "@/server/user-preferences.service";
import { getMeProfile } from "@/server/me-profile.service";

export async function GET() {
  const gate = await requireActiveUser();
  if (!gate.ok) return gate.response;
  const userId = gate.userId;
  try {
    const [profile, preferences] = await Promise.all([getMeProfile(userId), getUserPreferences(userId)]);
    return NextResponse.json({ profile, preferences });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "User not found") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to load account" }, { status: 500 });
  }
}
