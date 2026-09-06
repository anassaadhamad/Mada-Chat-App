import { connectDB } from "@/lib/mongodb";
import { User } from "@/server/models/User";
import { Conversation } from "@/server/models/Conversation";
import type { ChatMessage } from "@/lib/chat-types";
import {
  envOpenAiApiKey,
  envOpenAiChatModel,
  envMessageMaxContentLength,
  envAiAgentTimeZone,
  envAiAgentHistoryMessageLimit,
  envAiAgentMaxCompletionTokens,
} from "@/lib/env-server";
import type { ClientClockContext } from "@/lib/ai-client-clock";
import { assertConversationMessagingAllowed } from "@/server/blocking.service";
import {
  createMessage,
  listRecentMessagesForPersona,
  purgeExpiredDisappearingMessages,
} from "@/server/chat/conversations.service";
import { broadcastToConversation, emitTypingUpdateForPeers } from "@/lib/socket-io-bridge";
import { notifyNewMessageViaWebPush } from "@/server/notify-new-message-push";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Human-like typing delay: ~50ms per character plus 1–3s random jitter. */
export function getTypingDelay(text: string): number {
  const charCount = Math.max(text.length, 1);
  const base = charCount * 50;
  const jitterMs = 1000 + Math.floor(Math.random() * 2001);
  return Math.min(base + jitterMs, 45_000);
}

function interChunkDelayMs(): number {
  return 2000 + Math.floor(Math.random() * 1000);
}

const SPLIT_WHEN_LONGER_THAN = 150;
const MAX_CHARS_PER_CHUNK = 600;

function wallClockParts(ms: number, timeZone: string): {
  hour: string;
  minute: string;
  day: string;
  month: string;
  year: string;
} {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour12: false,
    }).formatToParts(new Date(ms));
    const part = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "00";
    return {
      hour: part("hour"),
      minute: part("minute"),
      day: part("day"),
      month: part("month"),
      year: part("year"),
    };
  } catch {
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      hour: pad(d.getUTCHours()),
      minute: pad(d.getUTCMinutes()),
      day: pad(d.getUTCDate()),
      month: pad(d.getUTCMonth() + 1),
      year: String(d.getUTCFullYear()),
    };
  }
}

/** Per-message line: `[Time: HH:mm DD/MM]` in the configured timezone. */
function formatTranscriptTimeHeader(createdAtMs: number, timeZone: string): string {
  const { hour, minute, day, month } = wallClockParts(createdAtMs, timeZone);
  return `[Time: ${hour}:${minute} ${day}/${month}]`;
}

function describeTimeOfDayBand(hour24: number): string {
  if (hour24 >= 1 && hour24 < 5) return "very late night or early morning";
  if (hour24 >= 5 && hour24 < 12) return "morning";
  if (hour24 >= 12 && hour24 < 17) return "afternoon";
  if (hour24 >= 17 && hour24 < 21) return "evening";
  if (hour24 >= 21 || hour24 === 0) return "late night";
  return "early morning";
}

function currentMomentNarration(nowMs: number, timeZone: string): string {
  const p = wallClockParts(nowMs, timeZone);
  const hourNum = Number.parseInt(p.hour, 10);
  const band = Number.isFinite(hourNum) ? describeTimeOfDayBand(hourNum) : "this time of day";
  const weekday = (() => {
    try {
      return new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long" }).format(new Date(nowMs));
    } catch {
      return "";
    }
  })();
  const dateStr = `${p.day}/${p.month}/${p.year}`;
  const timeStr = `${p.hour}:${p.minute}`;
  return `${weekday ? `${weekday}, ` : ""}${dateStr} ${timeStr} (${band})`;
}

/**
 * If total length ≤ splitWhenLongerThan, one chunk.
 * Otherwise split at sentence boundaries, up to maxCharsPerChunk per bubble.
 */
export function splitReplyIntoChunks(
  text: string,
  maxCharsPerChunk = MAX_CHARS_PER_CHUNK,
  splitWhenLongerThan = SPLIT_WHEN_LONGER_THAN
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= splitWhenLongerThan) return [trimmed];

  const sentences = trimmed.split(/(?<=[.!?؟۔])\s+/).filter(Boolean);
  if (sentences.length <= 1) {
    const chunks: string[] = [];
    for (let i = 0; i < trimmed.length; i += maxCharsPerChunk) {
      chunks.push(trimmed.slice(i, i + maxCharsPerChunk).trim());
    }
    return chunks.filter(Boolean);
  }

  const chunks: string[] = [];
  let buf = "";
  for (const s of sentences) {
    const next = buf ? `${buf} ${s}` : s;
    if (next.length > maxCharsPerChunk && buf) {
      chunks.push(buf.trim());
      buf = s;
    } else {
      buf = next;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());

  if (chunks.length > 6) {
    const merged: string[] = [];
    let acc = "";
    for (const c of chunks) {
      if ((acc + " " + c).trim().length > maxCharsPerChunk && acc) {
        merged.push(acc.trim());
        acc = c;
      } else {
        acc = acc ? `${acc} ${c}` : c;
      }
    }
    if (acc.trim()) merged.push(acc.trim());
    return merged;
  }
  return chunks;
}

function formatTranscriptLine(
  m: ChatMessage,
  selfId: string,
  selfShort: string,
  peerShort: string
): string {
  const who = m.senderId === selfId ? selfShort : peerShort;
  if (m.deleted) return `[${who}]: [deleted]`;
  const bits: string[] = [];
  const c = (m.content ?? "").trim();
  if (c) bits.push(c);
  if (m.fileUrl && !m.deleted) {
    bits.push(`[${m.fileType ?? "file"} attachment]`);
  }
  if (!bits.length) return `[${who}]: [empty]`;
  return `[${who}]: ${bits.join(" ")}`;
}

function formatTranscriptBlock(
  m: ChatMessage,
  selfId: string,
  selfShort: string,
  peerShort: string,
  timeZone: string
): string {
  const header = formatTranscriptTimeHeader(m.createdAt, timeZone);
  const body = formatTranscriptLine(m, selfId, selfShort, peerShort);
  /** One line per message saves blank lines vs header/body split. */
  return `${header} ${body}`;
}

/** Dense time rules (input tokens). */
function buildTimeAwarenessPolicy(): string {
  return [
    "Time: infer each past send only from that line's leading [Time: HH:mm DD/MM]; ignore other metadata.",
    "Now/gap: use Reply-time below; if it includes a device clock string, that string wins for o'clock.",
    "Same calendar day: earlier [Time:] clock than 'now' = earlier that day; you write at Reply-time 'now'.",
    "Refer to past sends relatively in chat language (e.g. من 3 ساعات); avoid raw clock echo unless asked.",
    "Small gap ⇒ live thread; large gap ⇒ returning after pause (re-entry tone).",
  ].join(" ");
}

function buildReplyTimeContext(
  nowMs: number,
  lastMessageAtMs: number | null,
  timeZone: string,
  deviceLocalLabel?: string
): string {
  const label = deviceLocalLabel?.trim();
  const parts: string[] = [];

  if (label) {
    parts.push(
      `Reply-time: now="${label}" tz=${timeZone} (match user-visible clock; each transcript line's [Time:] uses this tz).`
    );
  } else {
    parts.push(`Reply-time: ${currentMomentNarration(nowMs, timeZone)} (${timeZone}, server).`);
  }

  if (lastMessageAtMs == null) {
    parts.push("No prior lines in window.");
    return parts.join(" ");
  }

  const gapMinutes = Math.max(0, (nowMs - lastMessageAtMs) / 60_000);
  parts.push(`Gap: ${Math.round(gapMinutes)}m since last line.`);

  if (gapMinutes > 240) parts.push("Long pause—fresh greeting ok.");
  else if (gapMinutes < 30) parts.push("Live—no repeated goodbyes unless truly ending.");
  else parts.push("Medium pause—resume naturally.");

  return parts.join(" ");
}

async function loadDisplayLabels(conversationId: string, selfId: string): Promise<{
  selfLabel: string;
  peerLabel: string;
}> {
  await connectDB();
  const me = await User.findById(selfId).select("name email").lean();
  const selfLabel = (me?.name?.trim() || me?.email || "Me").slice(0, 40);

  const conv = await Conversation.findById(conversationId).select("participantIds").lean();
  if (!conv) throw new Error("Conversation not found");
  const otherId = conv.participantIds.map((p) => p.toString()).find((id) => id !== selfId);
  if (!otherId) {
    return { selfLabel, peerLabel: "Peer" };
  }
  const peer = await User.findById(otherId).select("name email").lean();
  const peerLabel = (peer?.name?.trim() || peer?.email || "Peer").slice(0, 40);
  return { selfLabel, peerLabel };
}

async function openAiChatCompletion(system: string, user: string): Promise<string> {
  const key = envOpenAiApiKey();
  if (!key) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: envOpenAiChatModel(),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.8,
        max_completion_tokens: envAiAgentMaxCompletionTokens(),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`OpenAI HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };
    const raw = data.choices?.[0]?.message?.content;
    return typeof raw === "string" ? raw.trim() : "";
  } finally {
    clearTimeout(timer);
  }
}

async function afterMessagePersistEffects(
  conversationId: string,
  message: ChatMessage,
  senderUserId: string,
  appOrigin: string
): Promise<void> {
  const purged = await purgeExpiredDisappearingMessages();
  for (const batch of purged) {
    broadcastToConversation(batch.conversationId, "messages:removed", {
      conversationId: batch.conversationId,
      messageIds: batch.messageIds,
    });
  }
  broadcastToConversation(conversationId, "message:new", { message });
  void notifyNewMessageViaWebPush({
    conversationId,
    message,
    senderUserId,
    appOrigin,
  });
}

export type GeneratePersonaReplyInput = {
  conversationId: string;
  senderId: string;
  directive: string;
  /** Up to 60; passed to Mongo fetch. Default from AI_AGENT_HISTORY_MESSAGE_LIMIT. */
  historyMessageLimit?: number;
  /**
   * Browser snapshot: "now", IANA zone, and display string from the user's device.
   * Suggest/reply routes require this; autopilot omits it and uses server fallback.
   */
  clientClock?: ClientClockContext;
};

/**
 * OpenAI only — does not persist or emit socket events (used for Suggested mode).
 */
export async function generatePersonaReplyText(input: GeneratePersonaReplyInput): Promise<string> {
  const directive = input.directive.trim();
  if (!directive) {
    throw new Error("Directive is required");
  }
  if (directive.length > 2000) {
    throw new Error("Directive too long");
  }

  await assertConversationMessagingAllowed(input.conversationId, input.senderId);

  const defaultHist = envAiAgentHistoryMessageLimit();
  const histLimit = Math.min(Math.max(input.historyMessageLimit ?? defaultHist, 5), 60);
  const history = await listRecentMessagesForPersona(input.conversationId, input.senderId, histLimit);
  const { selfLabel, peerLabel } = await loadDisplayLabels(input.conversationId, input.senderId);
  const cc = input.clientClock;
  const nowMs = cc?.nowEpochMs ?? Date.now();
  const timeZone = cc?.timeZone ?? envAiAgentTimeZone();
  const deviceLocalLabel = cc?.localLabel;
  const lastMessageAtMs =
    history.length > 0 ? history[history.length - 1]!.createdAt : null;

  const transcript = history
    .map((m) => formatTranscriptBlock(m, input.senderId, selfLabel, peerLabel, timeZone))
    .join("\n");

  const displayName = selfLabel;
  const timePolicy = buildTimeAwarenessPolicy();
  const replyCtx = buildReplyTimeContext(nowMs, lastMessageAtMs, timeZone, deviceLocalLabel);

  const system = [
    `You are ${displayName} on Mada (digital twin). Mirror recent tone, language, emoji, punctuation. Goal: ${directive}`,
    timePolicy,
    replyCtx,
    `Output: one chat bubble—plain text only, no quotes/labels/meta, no markdown fences; stay on the tail; keep it short unless clearly needed.`,
  ].join(" ");

  const transcriptIntro = cc
    ? `Oldest→newest; each line: [Time: HH:mm DD/MM] then speaker. "${selfLabel}"=you "${peerLabel}"=them:`
    : `Oldest→newest; each line starts with [Time:…] (tz=${timeZone}). "${selfLabel}"=you "${peerLabel}"=them:`;

  const userPrompt = [
    transcriptIntro,
    transcript || "(no prior messages)",
    "",
    `Write next message as ${displayName}.`,
  ].join("\n");

  const reply = await openAiChatCompletion(system, userPrompt);
  if (!reply) {
    throw new Error("Empty model reply");
  }
  const maxLen = envMessageMaxContentLength();
  return reply.length > maxLen ? reply.slice(0, maxLen) : reply;
}

export type RunPersonaChunkedSendInput = {
  conversationId: string;
  senderId: string;
  directive: string;
  appOrigin: string;
  historyMessageLimit?: number;
  /** When true, persisted rows are flagged so autopilot does not recurse. */
  fromAiAgent?: boolean;
  clientClock?: ClientClockContext;
};

/**
 * Generates via OpenAI, then sends one or more chunks with typing simulation and Mongo persistence.
 */
export async function runPersonaChunkedSendJob(input: RunPersonaChunkedSendInput): Promise<{ chunksSent: number }> {
  const capped = await generatePersonaReplyText({
    conversationId: input.conversationId,
    senderId: input.senderId,
    directive: input.directive,
    historyMessageLimit: input.historyMessageLimit ?? envAiAgentHistoryMessageLimit(),
    clientClock: input.clientClock,
  });

  const chunks = splitReplyIntoChunks(capped);
  if (!chunks.length) {
    throw new Error("Empty reply chunks");
  }

  let sent = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!.trim();
    if (!chunk) continue;

    await emitTypingUpdateForPeers(input.conversationId, input.senderId, true);
    await sleep(getTypingDelay(chunk));
    await emitTypingUpdateForPeers(input.conversationId, input.senderId, false);

    const message = await createMessage(input.conversationId, input.senderId, chunk, null, null, {
      fromAiAgent: !!input.fromAiAgent,
    });
    await afterMessagePersistEffects(input.conversationId, message, input.senderId, input.appOrigin);
    sent += 1;

    if (i < chunks.length - 1) {
      await sleep(interChunkDelayMs());
    }
  }

  return { chunksSent: sent };
}

/** @deprecated Use `runPersonaChunkedSendJob` with explicit flags; kept for existing API route. */
export type RunPersonaReplyInput = {
  conversationId: string;
  senderId: string;
  directive: string;
  appOrigin: string;
  clientClock?: ClientClockContext;
};

export async function runPersonaReplyJob(input: RunPersonaReplyInput): Promise<{ chunksSent: number }> {
  return runPersonaChunkedSendJob({
    ...input,
    fromAiAgent: false,
  });
}
