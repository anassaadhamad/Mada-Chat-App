import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const conversationSchema = new Schema(
  {
    participantIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      required: true,
      validate: {
        validator(ids: unknown[]) {
          return Array.isArray(ids) && ids.length >= 2;
        },
        message: "A conversation needs at least two participants.",
      },
    },
    /** Stable key for 1:1 chats: `${min(ObjectId)}:${max(ObjectId)}` */
    directKey: { type: String, sparse: true, unique: true, index: true },
    lastMessageAt: { type: Date },
    /**
     * Disappearing messages: TTL in seconds for new messages (5, 60, 3600, 86400).
     * Null/omit = off. Same value for both participants; updated via API + Socket.IO.
     */
    disappearingMessageSeconds: { type: Number, default: null, min: 0 },
    /** Per-user read cursor: userId (hex string) -> last read time (ISO stored in Mixed). */
    readAtByUser: { type: Schema.Types.Mixed, default: {} },
    /** User ids who hid this DM in “Locked chats” on their client (per-user vault). */
    lockedByUserIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    /** Per-user pin time: userId (hex string) -> when pinned (ISO in Mixed). Omitted key = unpinned for that user. */
    pinnedAtByUser: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

conversationSchema.index({ participantIds: 1 });
conversationSchema.index({ lockedByUserIds: 1 });

export type ConversationDoc = InferSchemaType<typeof conversationSchema> & {
  _id: import("mongoose").Types.ObjectId;
};

export const Conversation: Model<ConversationDoc> =
  (models.Conversation as Model<ConversationDoc>) ??
  model<ConversationDoc>("Conversation", conversationSchema);
