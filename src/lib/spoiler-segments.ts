export type SpoilerSegment =
  | { type: "plain"; text: string }
  | { type: "spoiler"; text: string };

/**
 * Splits message text on Discord-style `||spoiler||` spans. Unmatched `||` is left as plain text.
 */
export function parseSpoilerPipeSegments(content: string): SpoilerSegment[] {
  if (!content.includes("||")) {
    return [{ type: "plain", text: content }];
  }
  const out: SpoilerSegment[] = [];
  let i = 0;
  while (i < content.length) {
    const open = content.indexOf("||", i);
    if (open === -1) {
      const tail = content.slice(i);
      if (tail) out.push({ type: "plain", text: tail });
      break;
    }
    if (open > i) {
      out.push({ type: "plain", text: content.slice(i, open) });
    }
    const close = content.indexOf("||", open + 2);
    if (close === -1) {
      out.push({ type: "plain", text: content.slice(open) });
      break;
    }
    out.push({ type: "spoiler", text: content.slice(open + 2, close) });
    i = close + 2;
  }
  return out.length > 0 ? out : [{ type: "plain", text: content }];
}
