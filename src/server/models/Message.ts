import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import {
  envMessageEmojiMax,
  envMessageFileNameMax,
  envMessageMaxContentLength,
  envMessageReplyExcerptSchemaMax,
} from "@/lib/env-server";

const messageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    content: { type: String, default: "", trim: true, maxlength: envMessageMaxContentLength() },
    /** Public URL path for attachments (e.g. `/api/files/uuid.png` or legacy `/uploads/...`). */
    fileUrl: { type: String, trim: true },
    fileType: { type: String, enum: ["image", "video", "pdf", "file", "audio"] },
    fileName: { type: String, trim: true, maxlength: envMessageFileNameMax() },
    fileSize: { type: Number, min: 0 },
    replyTo: {
      messageId: { type: Schema.Types.ObjectId, ref: "Message" },
      excerpt: { type: String, maxlength: envMessageReplyExcerptSchemaMax() },
      senderId: { type: Schema.Types.ObjectId, ref: "User" },
    },
    reactions: {
      type: [
        {
          userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
          emoji: { type: String, required: true, trim: true, maxlength: envMessageEmojiMax() },
        },
      ],
      default: [],
    },
    editedAt: { type: Date },
    deletedAt: { type: Date },
    /** Snapshot at send time when conversation had disappearing mode on (seconds). */
    disappearTtlSec: { type: Number, min: 1 },
    /** Wall-clock expiry after the peer has read the message (server-purged + attachment deleted). */
    disappearExpiresAt: { type: Date },
    /** When the disappear countdown started (same as read cursor advance for the reader). */
    disappearStartedAt: { type: Date },
    /** True when this row was created by the server AI autopilot (prevents reply ping-pong). */
    fromAiAgent: { type: Boolean, default: false },
    /** In-thread system line (e.g. disappearing messages toggled). Not a normal chat bubble. */
    isSystemNotice: { type: Boolean, default: false },
    systemNoticeKind: { type: String, enum: ["disappearing_timer"] },
    /** For `disappearing_timer`: TTL seconds when enabled, or null when turned off. */
    systemNoticeSeconds: { type: Number, default: null },
  },
  { timestamps: true }
);

messageSchema.pre("validate", async function preValidateMessage() {
  const doc = this as unknown as {
    content?: string;
    fileUrl?: string;
    fileType?: string;
    deletedAt?: Date | null;
  };
  if (doc.deletedAt) {
    return;
  }
  const sys = (doc as { isSystemNotice?: boolean }).isSystemNotice;
  if (sys) {
    const kind = (doc as { systemNoticeKind?: string }).systemNoticeKind;
    if (kind !== "disappearing_timer") {
      throw new Error("Invalid system notice");
    }
    return;
  }
  const hasText = typeof doc.content === "string" && doc.content.trim().length > 0;
  const hasFile =
    typeof doc.fileUrl === "string" &&
    doc.fileUrl.trim().length > 0 &&
    typeof doc.fileType === "string" &&
    doc.fileType.length > 0;
  if (!hasText && !hasFile) {
    throw new Error("Empty message");
  }
});

messageSchema.index({ conversationId: 1, createdAt: 1 });
messageSchema.index({ disappearExpiresAt: 1 }, { sparse: true });

export type MessageDoc = InferSchemaType<typeof messageSchema> & {
  _id: import("mongoose").Types.ObjectId;
};

export const Message: Model<MessageDoc> =
  (models.Message as Model<MessageDoc>) ?? model<MessageDoc>("Message", messageSchema);
