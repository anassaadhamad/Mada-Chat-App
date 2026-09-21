import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { Conversation } from "@/server/models/Conversation";
import { Message } from "@/server/models/Message";
import { User } from "@/server/models/User";
import {
  envAiAgentMaxCompletionTokens,
} from "@/lib/env-server";
import { generateAiChatCompletion } from "./ai-completion.service";
import { assertConversationMessagingAllowed } from "@/server/blocking.service";

const MAX_MESSAGES = 40;
const MAX_INPUT_CHARS = 28_000;

function toObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.isValidObjectId(id)) {
    throw new Error("Invalid message id");
  }
  return new mongoose.Types.ObjectId(id);
}

async function loadSenderLabels(conversationId: string, selfId: string): Promise<{
  selfLabel: string;
  peerLabel: string;
}> {
  const conv = await Conversation.findById(conversationId).select("participantIds").lean();
  if (!conv) throw new Error("Conversation not found");
  const otherId = conv.participantIds.map((p) => p.toString()).find((id) => id !== selfId);
  const me = await User.findById(selfId).select("name email").lean();
  const selfLabel = (me?.name?.trim() || me?.email || "Me").slice(0, 40);
  if (!otherId) {
    return { selfLabel, peerLabel: "Peer" };
  }
  const peer = await User.findById(otherId).select("name email").lean();
  const peerLabel = (peer?.name?.trim() || peer?.email || "Peer").slice(0, 40);
  return { selfLabel, peerLabel };
}

function formatMessageLine(
  doc: {
    senderId: mongoose.Types.ObjectId;
    content?: string | null;
    deletedAt?: Date | null;
    fileUrl?: string | null;
    fileType?: string | null;
    fileName?: string | null;
  },
  selfId: string,
  selfShort: string,
  peerShort: string
): string {
  const who = doc.senderId.toString() === selfId ? selfShort : peerShort;
  if (doc.deletedAt) return `[${who}]: [deleted]`;
  const bits: string[] = [];
  const c = String(doc.content ?? "").trim();
  if (c) bits.push(c);
  if (doc.fileUrl && String(doc.fileUrl).trim() && !doc.deletedAt) {
    bits.push(
      `[${doc.fileType ?? "file"}: ${String(doc.fileName ?? "attachment").slice(0, 120)}]`
    );
  }
  if (!bits.length) return `[${who}]: [empty]`;
  return `[${who}]: ${bits.join(" ")}`;
}

async function openAiSummarize(system: string, user: string): Promise<string> {
  const cap = Math.min(1200, Math.max(256, envAiAgentMaxCompletionTokens()));
  return generateAiChatCompletion(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    {
      temperature: 0.35,
      maxTokens: cap,
      timeoutMs: 90_000,
    }
  );
}

export type GenerateCatchUpSummaryInput = {
  conversationId: string;
  userId: string;
  /** Mongo message ids, in any order; server sorts by `createdAt` ascending. */
  messageIds: string[];
};

/**
 * Loads selected messages in this conversation and returns a concise AI summary (plain text).
 */
export async function generateCatchUpSummary(input: GenerateCatchUpSummaryInput): Promise<string> {
  const ids = [...new Set(input.messageIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    throw new Error("No messages selected");
  }
  if (ids.length > MAX_MESSAGES) {
    throw new Error(`Too many messages (max ${MAX_MESSAGES})`);
  }

  await assertConversationMessagingAllowed(input.conversationId, input.userId);

  let oids: mongoose.Types.ObjectId[];
  try {
    oids = ids.map(toObjectId);
  } catch {
    throw new Error("Invalid message id");
  }

  await connectDB();
  const convOid = toObjectId(input.conversationId);
  const docs = await Message.find({
    conversationId: convOid,
    _id: { $in: oids },
  })
    .sort({ createdAt: 1 })
    .lean();

  if (docs.length === 0) {
    throw new Error("No matching messages in this conversation");
  }

  const { selfLabel, peerLabel } = await loadSenderLabels(input.conversationId, input.userId);
  const lines = docs.map((d) => formatMessageLine(d, input.userId, selfLabel, peerLabel));
  let bundle = lines.join("\n");
  if (bundle.length > MAX_INPUT_CHARS) {
    bundle = `${bundle.slice(0, MAX_INPUT_CHARS)}\n\n[…truncated for length]`;
  }

  const system = [
    "You summarize private chat excerpts for someone catching up.",
    "Be concise: short paragraphs or bullets. Match the dominant language of the excerpt.",
    "Only use facts stated in the messages; do not invent events or people.",
    "Mention attachments only if relevant. Ignore empty or deleted-only lines for substance unless they matter for context.",
    "Output plain text only (no markdown code fences, no role-play).",
  ].join(" ");

  const userPrompt = [
    `Speakers: "${selfLabel}" = account owner, "${peerLabel}" = the other participant.`,
    "Selected messages (oldest first):",
    bundle,
    "",
    "Write a tight catch-up summary the reader can skim in under a minute.",
  ].join("\n");

  const summary = await openAiSummarize(system, userPrompt);
  if (!summary) {
    throw new Error("Empty model summary");
  }
  return summary;
}
