import path from "path";
import { readFile, stat } from "fs/promises";
import { NextResponse } from "next/server";
import { isStoredUploadFileName } from "@/lib/upload-stored-name";

type RouteContext = { params: Promise<{ name: string }> };

function contentTypeFor(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".ogg": "video/ogg",
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
    ".pdf": "application/pdf",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".opus": "audio/opus",
    ".wav": "audio/wav",
    ".oga": "audio/ogg",
    ".weba": "audio/webm",
  };
  return map[ext] ?? "application/octet-stream";
}

export async function GET(_request: Request, context: RouteContext) {
  const { name } = await context.params;
  if (!isStoredUploadFileName(name)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const baseDir = path.resolve(process.cwd(), "public", "uploads");
  const filePath = path.resolve(baseDir, name);
  const rel = path.relative(baseDir, filePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const st = await stat(filePath);
    if (!st.isFile()) {
      return new NextResponse("Not found", { status: 404 });
    }
    const body = await readFile(filePath);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentTypeFor(name),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
