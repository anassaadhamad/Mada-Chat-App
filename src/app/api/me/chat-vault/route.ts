import { NextResponse } from "next/server";
import { requireActiveUser } from "@/server/require-active-user";
import { isChatVaultConfigured } from "@/server/chat-vault.service";

export async function GET() {
  const gate = await requireActiveUser();
  if (!gate.ok) return gate.response;
  try {
    const configured = await isChatVaultConfigured(gate.userId);
    return NextResponse.json({ configured });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to load chat vault status" }, { status: 500 });
  }
}
