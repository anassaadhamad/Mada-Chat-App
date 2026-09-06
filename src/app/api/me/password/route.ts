import { NextResponse } from "next/server";
import { envPasswordMinLength } from "@/lib/env-server";
import { requireActiveUser } from "@/server/require-active-user";
import { changePassword } from "@/server/me-profile.service";

export async function POST(request: Request) {
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

  const oldPassword = String((body as { oldPassword?: unknown }).oldPassword ?? "");
  const newPassword = String((body as { newPassword?: unknown }).newPassword ?? "");
  const confirm = String((body as { confirmPassword?: unknown }).confirmPassword ?? "");

  if (!oldPassword || !newPassword) {
    return NextResponse.json({ error: "Missing password fields" }, { status: 400 });
  }
  if (newPassword !== confirm) {
    return NextResponse.json({ error: "New passwords do not match" }, { status: 400 });
  }

  const minLen = envPasswordMinLength();
  if (newPassword.length < minLen) {
    return NextResponse.json({ error: `Password must be at least ${minLen} characters` }, { status: 400 });
  }

  try {
    await changePassword(gate.userId, oldPassword, newPassword, minLen);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Current password incorrect") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg === "Password login not enabled for this account") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg === "Password too short" || msg === "Password too long") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to change password" }, { status: 500 });
  }
}
