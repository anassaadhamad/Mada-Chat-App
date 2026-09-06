import { NextResponse } from "next/server";
import { isAdmin } from "@/server/admin/is-admin";
import {
  getMessageAttachmentBytesTotal,
  getUploadDirectoryDiskBytes,
} from "@/server/admin/admin-stats.service";

export async function GET() {
  const gate = await isAdmin();
  if (!gate.ok) return gate.response;

  try {
    const [fromDb, disk] = await Promise.all([
      getMessageAttachmentBytesTotal(),
      getUploadDirectoryDiskBytes(),
    ]);
    return NextResponse.json({
      ...fromDb,
      uploadDirectory: disk,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to load storage stats" }, { status: 500 });
  }
}
