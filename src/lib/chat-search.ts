import type { ChatMessage } from "@/lib/chat-types";

export type ChatSearchFilter = "text" | "media" | "links" | "voice";

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/i;

export function textContainsUrl(text: string): boolean {
  return URL_RE.test(text);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Split plain text into segments for inline <mark> highlighting (case-insensitive). */
export function splitHighlightSegments(text: string, query: string): { text: string; mark: boolean }[] {
  const q = query.trim();
  if (!q) return [{ text, mark: false }];
  const re = new RegExp(escapeRegExp(q), "gi");
  const parts: { text: string; mark: boolean }[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, m.index), mark: false });
    }
    parts.push({ text: m[0], mark: true });
    lastIndex = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), mark: false });
  }
  if (parts.length === 0) parts.push({ text, mark: false });
  return parts;
}

function matchesToken(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return haystack.toLowerCase().includes(needle);
}

export function messageMatchesFilter(
  message: ChatMessage,
  filter: ChatSearchFilter,
  queryNormalized: string
): boolean {
  const content = message.content ?? "";
  const fileName = message.fileName ?? "";

  switch (filter) {
    case "text": {
      if (!queryNormalized) return false;
      return matchesToken(content, queryNormalized) || matchesToken(fileName, queryNormalized);
    }
    case "media": {
      const isMedia = message.fileType === "image" || message.fileType === "video";
      if (!isMedia) return false;
      if (!queryNormalized) return true;
      return matchesToken(content, queryNormalized) || matchesToken(fileName, queryNormalized);
    }
    case "links": {
      if (!textContainsUrl(content) && !textContainsUrl(fileName)) return false;
      if (!queryNormalized) return true;
      return matchesToken(content, queryNormalized) || matchesToken(fileName, queryNormalized);
    }
    case "voice": {
      if (message.fileType !== "audio") return false;
      if (!queryNormalized) return true;
      return matchesToken(content, queryNormalized) || matchesToken(fileName, queryNormalized);
    }
  }
}

export function orderedSearchMatchIds(
  messages: ChatMessage[],
  filter: ChatSearchFilter,
  queryNormalized: string
): string[] {
  const out: string[] = [];
  for (const m of messages) {
    if (messageMatchesFilter(m, filter, queryNormalized)) {
      out.push(m.id);
    }
  }
  return out;
}
