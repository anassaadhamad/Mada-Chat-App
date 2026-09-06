import { NextResponse } from "next/server";
import { isAdmin } from "@/server/admin/is-admin";
import { adminUpdateUser } from "@/server/admin/admin-users.service";

type RouteContext = { params: Promise<{ userId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const gate = await isAdmin();
  if (!gate.ok) return gate.response;

  const { userId } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const suspendedRaw = (body as { suspended?: unknown }).suspended;
  const roleRaw = (body as { role?: unknown }).role;

  const patch: { suspended?: boolean; role?: "USER" | "ADMIN" } = {};
  if (typeof suspendedRaw === "boolean") patch.suspended = suspendedRaw;
  if (roleRaw === "USER" || roleRaw === "ADMIN") patch.role = roleRaw;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Provide suspended and/or role" }, { status: 400 });
  }

  try {
    await adminUpdateUser(userId, patch, gate.adminUserId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    if (msg === "Invalid user id" || msg === "User not found") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (
      msg.includes("Cannot") ||
      msg === "No changes" ||
      msg === "Cannot suspend your own account"
    ) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
