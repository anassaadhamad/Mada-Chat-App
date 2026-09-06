import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/server/models/User";
import { assertParticipant } from "@/server/chat/conversations.service";

export type AiAgentMode = "off" | "suggested" | "autopilot";

function toObjectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.isValidObjectId(id)) {
    throw new Error("Invalid id");
  }
  return new mongoose.Types.ObjectId(id);
}

export async function getAiAgentConversationSettings(
  userId: string,
  conversationId: string
): Promise<{ mode: AiAgentMode; directive: string }> {
  await assertParticipant(conversationId, userId);
  await connectDB();
  const u = await User.findById(toObjectId(userId)).select("aiAgentConversations").lean();
  const rows = (u as { aiAgentConversations?: { conversationId: unknown; mode?: string; directive?: string }[] } | null)
    ?.aiAgentConversations;
  const cid = conversationId;
  const row = rows?.find((r) => String(r.conversationId) === cid);
  const mode = row?.mode;
  if (mode === "suggested" || mode === "autopilot") {
    return { mode, directive: typeof row?.directive === "string" ? row.directive : "" };
  }
  return { mode: "off", directive: typeof row?.directive === "string" ? row.directive : "" };
}

export async function setAiAgentConversationSettings(
  userId: string,
  conversationId: string,
  input: { mode: AiAgentMode; directive: string }
): Promise<void> {
  await assertParticipant(conversationId, userId);
  await connectDB();
  const uid = toObjectId(userId);
  const cid = toObjectId(conversationId);
  const directive = input.directive.trim().slice(0, 2000);
  const mode = input.mode;

  await User.updateOne({ _id: uid }, { $pull: { aiAgentConversations: { conversationId: cid } } });

  if (mode === "off" && !directive) {
    return;
  }

  await User.updateOne(
    { _id: uid },
    {
      $push: {
        aiAgentConversations: {
          conversationId: cid,
          mode,
          directive,
        },
      },
    }
  );
}
