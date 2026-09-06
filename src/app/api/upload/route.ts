import { randomUUID } from "crypto";
import { createWriteStream } from "fs";
import { mkdir, stat, unlink } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import busboy from "busboy";
import { NextResponse } from "next/server";
import { requireActiveUser } from "@/server/require-active-user";
import type { MessageFileType } from "@/lib/chat-types";
import { envMessageFileNameMax } from "@/lib/env-server";
import { formatFileSize } from "@/lib/format-file-size";
import { parseUploadMaxBytesFromEnv } from "@/lib/upload-config-server";
import {
  classifyMime,
  isAllowedUploadMime,
  safeStoredExtension,
} from "@/lib/upload-validation";

export const runtime = "nodejs";

const MAX_BYTES = parseUploadMaxBytesFromEnv(process.env.UPLOAD_MAX_BYTES);

async function removeFileQuietly(p: string): Promise<void> {
  try {
    await unlink(p);
  } catch {
    /* ignore */
  }
}

export async function POST(request: Request) {
  const gate = await requireActiveUser();
  if (!gate.ok) return gate.response;

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  if (!request.body) {
    return NextResponse.json({ error: "Missing body" }, { status: 400 });
  }

  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });

  const nodeReadable = Readable.fromWeb(request.body as import("stream/web").ReadableStream);

  try {
    const result = await new Promise<{
      url: string;
      fileType: MessageFileType;
      fileName: string;
      fileSize: number;
    }>((resolve, reject) => {
      let settled = false;
      const settleResolve = (value: {
        url: string;
        fileType: MessageFileType;
        fileName: string;
        fileSize: number;
      }) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const settleReject = (err: Error) => {
        if (settled) return;
        settled = true;
        reject(err);
      };

      const bb = busboy({
        headers: { "content-type": contentType },
        limits: { fileSize: MAX_BYTES, files: 1 },
      });

      let sawFileField = false;

      bb.on("file", (fieldname, file, info) => {
        if (fieldname !== "file") {
          file.resume();
          return;
        }
        if (sawFileField) {
          file.resume();
          return;
        }
        sawFileField = true;

        const originalName = (info.filename && String(info.filename)) || "file";
        const mime = (info.mimeType && String(info.mimeType)) || "application/octet-stream";

        if (!isAllowedUploadMime(mime, originalName)) {
          file.resume();
          settleReject(new Error("INVALID_TYPE"));
          return;
        }

        const safeExt = safeStoredExtension(originalName);
        const storedName = `${randomUUID()}${safeExt}`;
        const destPath = path.join(dir, storedName);
        const ws = createWriteStream(destPath, { flags: "w", mode: 0o644 });

        file.once("limit", () => {
          file.unpipe();
          ws.destroy();
          void removeFileQuietly(destPath!);
          settleReject(new Error("FILE_TOO_LARGE"));
        });

        void pipeline(file, ws)
          .then(async () => {
            const st = await stat(destPath!);
            const fileType = classifyMime(mime) as MessageFileType;
            const url = `/api/files/${storedName}`;
            settleResolve({
              url,
              fileType,
              fileName: originalName.slice(0, envMessageFileNameMax()),
              fileSize: st.size,
            });
          })
          .catch(async (err) => {
            await removeFileQuietly(destPath!);
            settleReject(err instanceof Error ? err : new Error(String(err)));
          });
      });

      bb.once("error", (err) => {
        settleReject(err instanceof Error ? err : new Error(String(err)));
      });

      bb.once("finish", () => {
        queueMicrotask(() => {
          if (settled) return;
          if (!sawFileField) {
            settleReject(new Error("MISSING_FILE"));
          }
        });
      });

      nodeReadable.once("error", (err) => {
        settleReject(err instanceof Error ? err : new Error(String(err)));
      });

      nodeReadable.pipe(bb);
    });

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "FILE_TOO_LARGE") {
      const maxLabel = formatFileSize(MAX_BYTES);
      return NextResponse.json({ error: `File too large (max ${maxLabel})` }, { status: 413 });
    }
    if (msg === "INVALID_TYPE") {
      return NextResponse.json({ error: "File type not allowed" }, { status: 415 });
    }
    if (msg === "MISSING_FILE") {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    console.error("upload", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
