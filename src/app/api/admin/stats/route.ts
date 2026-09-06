import { NextResponse } from "next/server";
import { isAdmin } from "@/server/admin/is-admin";
import {
  getAdminSummaryCounts,
  getMessagesByHourSeries,
  getNewUsersPerDaySeries,
} from "@/server/admin/admin-stats.service";

export async function GET() {
  const gate = await isAdmin();
  if (!gate.ok) return gate.response;

  try {
    const [summary, newUsersPerDay, messagesByHour] = await Promise.all([
      getAdminSummaryCounts(),
      getNewUsersPerDaySeries(30),
      getMessagesByHourSeries(14),
    ]);

    return NextResponse.json({
      ...summary,
      uptimeSeconds: Math.floor(process.uptime()),
      dbConnected: summary.dbPingMs != null,
      charts: {
        newUsersPerDay,
        messagesByHour,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}
