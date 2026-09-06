import type { MessageReactionSummary } from "@/lib/chat-types";

/** Quick-reaction set shown in the message hover / long-press bar. */
export const MESSAGE_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

export type MessageReactionEmoji = (typeof MESSAGE_REACTION_EMOJIS)[number];

export type MessageReactionEntry = {
  userId: string;
  emoji: string;
};

export function isAllowedReactionEmoji(emoji: string): boolean {
  return (MESSAGE_REACTION_EMOJIS as readonly string[]).includes(emoji);
}

/** Stable display order (picker order). */
export function sortReactionSummaries(summaries: MessageReactionSummary[]): MessageReactionSummary[] {
  const order = new Map<string, number>(MESSAGE_REACTION_EMOJIS.map((e, i) => [e, i]));
  return [...summaries].sort((a, b) => (order.get(a.emoji) ?? 99) - (order.get(b.emoji) ?? 99));
}

export function aggregateReactions(entries: MessageReactionEntry[]): MessageReactionSummary[] {
  const byEmoji = new Map<string, Set<string>>();
  const firstIndex = new Map<string, number>();
  let seq = 0;
  for (const { userId, emoji } of entries) {
    if (!isAllowedReactionEmoji(emoji)) continue;
    if (!byEmoji.has(emoji)) {
      byEmoji.set(emoji, new Set());
      firstIndex.set(emoji, seq++);
    }
    byEmoji.get(emoji)!.add(userId);
  }
  const emojis = [...byEmoji.keys()].sort((a, b) => (firstIndex.get(a) ?? 0) - (firstIndex.get(b) ?? 0));
  return emojis.map((emoji) => ({
    emoji,
    userIds: [...(byEmoji.get(emoji) ?? [])],
  }));
}

export function reactionsFromRawDoc(raw: unknown): MessageReactionSummary[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const entries: MessageReactionEntry[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const userId = (r as { userId?: unknown }).userId;
    const emoji = String((r as { emoji?: unknown }).emoji ?? "").trim();
    if (userId == null || !emoji) continue;
    entries.push({ userId: String(userId), emoji });
  }
  const agg = aggregateReactions(entries);
  return agg.length ? sortReactionSummaries(agg) : undefined;
}

/** Client-side mirror of server toggle: one reaction per user; tap same emoji removes. */
export function optimisticToggleReaction(
  summaries: MessageReactionSummary[] | undefined,
  userId: string,
  emoji: string
): MessageReactionSummary[] {
  const entries: MessageReactionEntry[] = [];
  for (const s of summaries ?? []) {
    for (const uid of s.userIds) {
      entries.push({ userId: uid, emoji: s.emoji });
    }
  }
  const idx = entries.findIndex((e) => e.userId === userId);
  if (idx !== -1 && entries[idx].emoji === emoji) {
    entries.splice(idx, 1);
  } else if (idx !== -1) {
    entries[idx] = { userId, emoji };
  } else {
    entries.push({ userId, emoji });
  }
  const agg = aggregateReactions(entries);
  return sortReactionSummaries(agg);
}
