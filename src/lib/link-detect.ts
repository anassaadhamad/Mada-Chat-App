/** First HTTP(S) or www. URL in plain text (for link previews). */
const FIRST_URL_RE = /\b(?:https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/i;

/**
 * Returns the first URL in `text`, normalized to absolute https when starting with `www.`.
 * Only http/https are returned.
 */
export function extractFirstHttpUrl(text: string): string | null {
  if (!text || !text.trim()) return null;
  const m = text.match(FIRST_URL_RE);
  if (!m) return null;
  let raw = m[0].trim();
  if (raw.startsWith("www.")) {
    raw = `https://${raw}`;
  }
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}
