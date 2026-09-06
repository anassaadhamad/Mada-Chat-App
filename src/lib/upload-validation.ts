import path from "path";

const VOICE_EXT_RE = /\.(webm|weba|m4a|mp3|ogg|opus|wav|oga)$/i;

/**
 * Allowed MIME types for chat attachments (declared type + optional filename hint).
 * `application/octet-stream` is accepted only when the filename looks like a voice recording.
 */
export function isAllowedUploadMime(mime: string, originalName: string): boolean {
  const m = (mime || "application/octet-stream").toLowerCase().trim();
  if (m.startsWith("image/")) return true;
  if (m.startsWith("video/")) return true;
  if (m.startsWith("audio/")) return true;
  if (m === "application/pdf") return true;
  if (m === "application/octet-stream" && VOICE_EXT_RE.test(originalName)) return true;
  return false;
}

export function classifyMime(mime: string): "image" | "video" | "pdf" | "file" | "audio" {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m === "application/pdf") return "pdf";
  return "file";
}

export function validateClientFileBeforeUpload(
  file: File,
  maxBytes: number
): "tooLarge" | "badType" | null {
  if (file.size > maxBytes) return "tooLarge";
  const name = typeof file.name === "string" ? file.name : "file";
  if (!isAllowedUploadMime(file.type || "application/octet-stream", name)) {
    return "badType";
  }
  return null;
}

export function safeStoredExtension(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  return ext && /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : "";
}
