import { NextResponse } from "next/server";
import { isAdmin } from "@/server/admin/is-admin";
import { listUserConversationsForAdmin } from "@/server/admin/admin-users.service";

type RouteContext = { params: Promise<{ userId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const gate = await isAdmin();
  if (!gate.ok) return gate.response;

  const { userId } = await context.params;
  try {
    const conversations = await listUserConversationsForAdmin(userId);
    return NextResponse.json({ conversations });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Invalid user id") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to load conversations" }, { status: 500 });
  }
}
