import path from "path";
import { unlink } from "fs/promises";
import { isStoredUploadFileName } from "@/lib/upload-stored-name";

/** Deletes a file under `public/uploads` when `fileUrl` is `/api/files/{name}` or `/uploads/{name}`. */
export async function tryDeleteStoredUploadPublicUrl(fileUrl: string | null | undefined): Promise<void> {
  if (!fileUrl || typeof fileUrl !== "string") return;
  const u = fileUrl.trim();
  const apiPrefix = "/api/files/";
  const legacyPrefix = "/uploads/";
  let name: string;
  if (u.startsWith(apiPrefix)) {
    name = u.slice(apiPrefix.length);
  } else if (u.startsWith(legacyPrefix)) {
    name = u.slice(legacyPrefix.length);
  } else {
    return;
  }
  if (!name || name.includes("/") || name.includes("\\") || !isStoredUploadFileName(name)) return;
  const baseDir = path.resolve(process.cwd(), "public", "uploads");
  const filePath = path.resolve(baseDir, name);
  const rel = path.relative(baseDir, filePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return;
  try {
    await unlink(filePath);
  } catch {
    /* ignore */
  }
}
