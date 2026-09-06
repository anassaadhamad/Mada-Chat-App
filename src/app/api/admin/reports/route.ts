import { NextResponse } from "next/server";
import { isAdmin } from "@/server/admin/is-admin";
import { listMessageReports } from "@/server/admin/admin-stats.service";
import {
  envAdminReportsListDefault,
  envAdminReportsListMax,
} from "@/lib/env-server";

export async function GET(request: Request) {
  const gate = await isAdmin();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    envAdminReportsListMax(),
    Math.max(1, Number.parseInt(searchParams.get("limit") ?? String(envAdminReportsListDefault()), 10) || envAdminReportsListDefault())
  );

  try {
    const reports = await listMessageReports(limit);
    return NextResponse.json({ reports });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to load reports" }, { status: 500 });
  }
}
