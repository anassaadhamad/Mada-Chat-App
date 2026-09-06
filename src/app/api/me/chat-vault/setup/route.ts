import { NextResponse } from "next/server";
import { requireActiveUser } from "@/server/require-active-user";
import { setChatVaultPin } from "@/server/chat-vault.service";

export async function POST(req: Request) {
  const gate = await requireActiveUser();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const pin =
    body && typeof body === "object" && "pin" in body ? String((body as { pin: unknown }).pin ?? "") : "";

  const result = await setChatVaultPin(gate.userId, pin);
  if (!result.ok) {
    const status = result.error.includes("already") ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}
