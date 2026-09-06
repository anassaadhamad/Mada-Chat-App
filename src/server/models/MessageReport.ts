import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { envMessageReportReasonMax } from "@/lib/env-server";

const messageReportSchema = new Schema(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    messageId: { type: Schema.Types.ObjectId, ref: "Message", required: true, index: true },
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
    reason: { type: String, trim: true, maxlength: envMessageReportReasonMax(), default: "" },
    status: {
      type: String,
      enum: ["open", "reviewed", "dismissed"],
      default: "open",
      index: true,
    },
  },
  { timestamps: true }
);

messageReportSchema.index({ createdAt: -1 });

export type MessageReportDoc = InferSchemaType<typeof messageReportSchema> & {
  _id: import("mongoose").Types.ObjectId;
};

export const MessageReport: Model<MessageReportDoc> =
  (models.MessageReport as Model<MessageReportDoc>) ??
  model<MessageReportDoc>("MessageReport", messageReportSchema);
