import mongoose from "mongoose";
import { readdir, stat } from "fs/promises";
import path from "path";
import { connectDB } from "@/lib/mongodb";
import { envAdminReportPreviewMax } from "@/lib/env-server";
import { User } from "@/server/models/User";
import { Conversation } from "@/server/models/Conversation";
import { Message } from "@/server/models/Message";
import { MessageReport } from "@/server/models/MessageReport";

export async function getAdminSummaryCounts(): Promise<{
  totalUsers: number;
  activeConversations: number;
  totalMessages: number;
  dbPingMs: number | null;
}> {
  await connectDB();
  const t0 = Date.now();
  let dbPingMs: number | null = null;
  try {
    await mongoose.connection.db?.admin().ping();
    dbPingMs = Date.now() - t0;
  } catch {
    dbPingMs = null;
  }

  const [totalUsers, activeConversations, totalMessages] = await Promise.all([
    User.countDocuments(),
    Conversation.countDocuments(),
    Message.countDocuments(),
  ]);

  return { totalUsers, activeConversations, totalMessages, dbPingMs };
}

export async function getNewUsersPerDaySeries(days: number): Promise<{ date: string; count: number }[]> {
  await connectDB();
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  cutoff.setUTCHours(0, 0, 0, 0);

  const rows = await User.aggregate<{ _id: string; count: number }>([
    { $match: { createdAt: { $gte: cutoff } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return rows.map((r) => ({ date: r._id, count: r.count }));
}

export async function getMessagesByHourSeries(lastDays: number): Promise<{ hour: number; count: number }[]> {
  await connectDB();
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - lastDays);

  const rows = await Message.aggregate<{ _id: number; count: number }>([
    {
      $match: {
        createdAt: { $gte: cutoff },
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      },
    },
    {
      $group: {
        _id: { $hour: { date: "$createdAt", timezone: "UTC" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const byHour = new Map<number, number>();
  for (const r of rows) {
    byHour.set(r._id, r.count);
  }
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: byHour.get(hour) ?? 0,
  }));
}

export async function getMessageAttachmentBytesTotal(): Promise<{
  totalBytesFromRecords: number;
  messagesWithFile: number;
}> {
  await connectDB();
  const agg = await Message.aggregate<{ total: number; n: number }>([
    {
      $match: {
        fileSize: { $gt: 0 },
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$fileSize" },
        n: { $sum: 1 },
      },
    },
  ]);
  const row = agg[0];
  return {
    totalBytesFromRecords: row?.total ?? 0,
    messagesWithFile: row?.n ?? 0,
  };
}

export async function getUploadDirectoryDiskBytes(): Promise<{ fileCount: number; totalBytes: number }> {
  const dir = path.join(process.cwd(), "public", "uploads");
  let fileCount = 0;
  let totalBytes = 0;
  try {
    const names = await readdir(dir);
    for (const name of names) {
      try {
        const st = await stat(path.join(dir, name));
        if (st.isFile()) {
          fileCount++;
          totalBytes += st.size;
        }
      } catch {
        /* skip */
      }
    }
  } catch {
    return { fileCount: 0, totalBytes: 0 };
  }
  return { fileCount, totalBytes };
}

export async function listMessageReports(limit: number) {
  await connectDB();
  const list = await MessageReport.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("reporterId", "email name")
    .populate("messageId", "content createdAt")
    .lean();

  const previewMax = envAdminReportPreviewMax();
  return list.map((r) => {
    const rep = r.reporterId as unknown as { email?: string; name?: string } | null;
    const msg = r.messageId as unknown as { content?: string; createdAt?: Date } | null;
    return {
      id: r._id.toString(),
      status: r.status,
      reason: r.reason,
      createdAt: r.createdAt instanceof Date ? r.createdAt.getTime() : Date.now(),
      reporterEmail: rep?.email ?? null,
      reporterName: rep?.name ?? null,
      messagePreview: msg?.content?.slice(0, previewMax) ?? null,
      messageCreatedAt: msg?.createdAt instanceof Date ? msg.createdAt.getTime() : null,
      conversationId: r.conversationId?.toString(),
    };
  });
}
