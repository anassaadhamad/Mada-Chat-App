import type { MessageFileType } from "@/lib/chat-types";

/** Client-side classification before upload response (matches `/api/upload`). */
export function classifyLocalFile(file: File): MessageFileType {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type === "application/pdf") return "pdf";
  return "file";
}
