import { NextResponse } from "next/server";
import { requireActiveUser } from "@/server/require-active-user";
import { deleteAccount } from "@/server/me-profile.service";

export async function DELETE(request: Request) {
  const gate = await requireActiveUser();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const confirm = String((body as { confirm?: unknown }).confirm ?? "").trim();
  if (confirm !== "DELETE MY ACCOUNT") {
    return NextResponse.json({ error: "Confirmation phrase mismatch" }, { status: 400 });
  }

  try {
    await deleteAccount(gate.userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
}
