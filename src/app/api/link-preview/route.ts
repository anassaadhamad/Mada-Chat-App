import { NextResponse } from "next/server";
import { requireActiveUser } from "@/server/require-active-user";
import { assertPublicHttpUrl, fetchLinkPreview } from "@/server/link-preview";

export async function GET(request: Request) {
  const gate = await requireActiveUser();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("url")?.trim();
  if (!raw) {
    return NextResponse.json({ preview: null });
  }

  try {
    assertPublicHttpUrl(raw);
  } catch {
    return NextResponse.json({ preview: null, error: "Invalid URL" }, { status: 400 });
  }

  try {
    const preview = await fetchLinkPreview(raw);
    return NextResponse.json(
      { preview },
      {
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  } catch (e) {
    console.error("link-preview", e);
    return NextResponse.json({ preview: null }, { status: 500 });
  }
}
