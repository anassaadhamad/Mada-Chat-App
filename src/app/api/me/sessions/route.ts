import { NextResponse } from "next/server";
import { requireActiveUser } from "@/server/require-active-user";
import { revokeAllSessions } from "@/server/me-profile.service";

export async function POST() {
  const gate = await requireActiveUser();
  if (!gate.ok) return gate.response;
  try {
    await revokeAllSessions(gate.userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to revoke sessions" }, { status: 500 });
  }
}
