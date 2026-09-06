import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: { type: String, trim: true, maxlength: 120 },
    bio: { type: String, trim: true, maxlength: 500, default: "" },
    image: { type: String },
    passwordHash: { type: String, select: false },
    /** Increment to invalidate all JWT sessions (sign out everywhere). */
    sessionRevision: { type: Number, default: 0, min: 0 },
    /** Soft-delete: user cannot sign in; data retained for conversation integrity. */
    deletedAt: { type: Date, default: null },
    /** Updated when the user disconnects all sockets (approximate “last seen”). */
    lastSeenAt: { type: Date },
    preferences: {
      theme: { type: String, enum: ["light", "dark", "system"], default: "system" },
      locale: { type: String, enum: ["en", "fr", "ar"], default: "en" },
      pushNotificationsEnabled: { type: Boolean, default: true },
      notificationSound: {
        type: String,
        enum: ["ding", "pop", "chime", "none"],
        default: "ding",
      },
      readReceiptsEnabled: { type: Boolean, default: true },
      showOnlineStatus: { type: Boolean, default: true },
      /** Hex color (#rrggbb) or image URL (https… or /api/files/…). Empty = default wallpaper. */
      chatWallpaper: { type: String, trim: true, maxlength: 2048, default: "" },
    },
    pushSubscriptions: {
      type: [
        {
          endpoint: { type: String, required: true },
          p256dh: { type: String, required: true },
          auth: { type: String, required: true },
          locale: { type: String, enum: ["en", "fr", "ar"], default: "en" },
        },
      ],
      default: [],
    },
    blockedUserIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    role: {
      type: String,
      enum: ["USER", "ADMIN"],
      default: "USER",
      index: true,
    },
    /** When set, the user cannot sign in or use chat APIs / sockets until cleared. */
    suspendedAt: { type: Date, default: null },
    /** Bcrypt hash of a 4-digit PIN used only for “Locked chats” (Secret Space); not device security. */
    chatVaultPinHash: { type: String, select: false, default: null },
    /** Per-conversation AI agent mode + directive (server-side autopilot reads this). */
    aiAgentConversations: {
      type: [
        {
          conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
          mode: {
            type: String,
            enum: ["off", "suggested", "autopilot"],
            default: "off",
          },
          directive: { type: String, maxlength: 2000, default: "" },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: import("mongoose").Types.ObjectId };

export const User: Model<UserDoc> =
  (models.User as Model<UserDoc>) ?? model<UserDoc>("User", userSchema);
