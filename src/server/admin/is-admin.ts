import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/server/models/User";

export type AdminAuthResult =
  | { ok: true; adminUserId: string }
  | { ok: false; response: NextResponse };

/**
 * Verifies the current session user is an active (non-suspended) ADMIN in the database.
 * Use on every `/api/admin/*` route handler (in addition to middleware).
 */
export async function isAdmin(): Promise<AdminAuthResult> {
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

  const admin = await User.findById(session.user.id).select("role suspendedAt").lean();
  if (!admin || admin.suspendedAt) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (admin.role !== "ADMIN") {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true, adminUserId: session.user.id };
}
