import { NextResponse } from "next/server";
import { requireActiveUser } from "@/server/require-active-user";
import { isValidChatVaultPin, verifyChatVaultPin } from "@/server/chat-vault.service";

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

  if (!isValidChatVaultPin(pin)) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 400 });
  }

  const ok = await verifyChatVaultPin(gate.userId, pin);
  if (!ok) {
    return NextResponse.json({ error: "Wrong PIN" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
