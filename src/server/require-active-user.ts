import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/server/models/User";

export type ActiveUserResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

/**
 * Authenticated user who is not suspended (DB check). Use for chat and account APIs.
 */
export async function requireActiveUser(): Promise<ActiveUserResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  try {
    await connectDB();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Database unavailable" }, { status: 503 }),
    };
  }

  const u = await User.findById(session.user.id).select("suspendedAt deletedAt").lean();
  if (!u) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (u.suspendedAt) {
    return { ok: false, response: NextResponse.json({ error: "Account suspended" }, { status: 403 }) };
  }
  if (u.deletedAt) {
    return { ok: false, response: NextResponse.json({ error: "Account deleted" }, { status: 403 }) };
  }

  return { ok: true, userId: session.user.id };
}
