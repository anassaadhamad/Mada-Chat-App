import { NextResponse } from "next/server";
import { requireActiveUser } from "@/server/require-active-user";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/server/models/User";

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

  const endpoint =
    body && typeof body === "object" && "endpoint" in body
      ? String((body as { endpoint: unknown }).endpoint ?? "").trim()
      : "";
  if (!endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  try {
    await connectDB();
    await User.updateOne(
      { _id: userId },
      { $pull: { pushSubscriptions: { endpoint } } }
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to remove subscription" }, { status: 500 });
  }
}
