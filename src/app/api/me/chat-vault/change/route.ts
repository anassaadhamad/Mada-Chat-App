import { NextResponse } from "next/server";
import { requireActiveUser } from "@/server/require-active-user";
import { changeChatVaultPin } from "@/server/chat-vault.service";

export async function POST(req: Request) {
  const gate = await requireActiveUser();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const oldPin =
    body && typeof body === "object" && "oldPin" in body
      ? String((body as { oldPin: unknown }).oldPin ?? "")
      : "";
  const newPin =
    body && typeof body === "object" && "newPin" in body
      ? String((body as { newPin: unknown }).newPin ?? "")
      : "";

  const result = await changeChatVaultPin(gate.userId, oldPin, newPin);
  if (!result.ok) {
    const lower = result.error.toLowerCase();
    const status =
      lower.includes("wrong") ? 401 : lower.includes("not configured") ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}
