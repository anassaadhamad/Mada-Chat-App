import webpush from "web-push";
import type { ChatMessage } from "@/lib/chat-types";
import {
  notificationBodyForMessage,
  notificationTitleForLockedChat,
  resolveLocaleForPush,
} from "@/lib/notification-message-body";
import { getSocketIOServer } from "@/lib/socket-io-bridge";
import { devLog, logError } from "@/lib/server-logger";
import { connectDB } from "@/lib/mongodb";
import {
  envPushSenderDisplayMaxLength,
  envWebPushSubjectDefault,
} from "@/lib/env-server";
import { Conversation } from "@/server/models/Conversation";
import { User } from "@/server/models/User";
import { usersBlockEachOther } from "@/server/blocking.service";

let vapidConfigured = false;

function ensureWebPushConfigured(): boolean {
  if (vapidConfigured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!pub || !priv) return false;
  webpush.setVapidDetails(
    process.env.WEB_PUSH_SUBJECT?.trim() || envWebPushSubjectDefault(),
    pub,
    priv
  );
  vapidConfigured = true;
  return true;
}

async function senderDisplayName(senderId: string): Promise<string> {
  const maxLen = envPushSenderDisplayMaxLength();
  await connectDB();
  const u = await User.findById(senderId).select("name email").lean();
  const name = u?.name?.trim();
  if (name) return name.slice(0, maxLen);
  const email = typeof u?.email === "string" ? u.email.trim() : "";
  if (email) return email.slice(0, maxLen);
  return "Mada";
}

type LeanSub = {
  endpoint: string;
  p256dh: string;
  auth: string;
  locale?: string;
};

function toWebPushSubscription(sub: LeanSub): { endpoint: string; keys: { p256dh: string; auth: string } } {
  return {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.p256dh, auth: sub.auth },
  };
}

/**
 * Sends Web Push to participants who have no active Socket.io connection (tab closed
 * or not on chat). Recipients with an open socket still get `message:new` and show
 * notifications from the client when the tab is hidden.
 */
export async function notifyNewMessageViaWebPush(params: {
  conversationId: string;
  message: ChatMessage;
  senderUserId: string;
  appOrigin: string;
}): Promise<void> {
  if (params.message.systemNotice) return;
  if (!ensureWebPushConfigured()) return;

  try {
    await connectDB();
    const conv = await Conversation.findById(params.conversationId).select("participantIds lockedByUserIds").lean();
    if (!conv?.participantIds?.length) return;

    const lockedSet = new Set(
      (conv.lockedByUserIds ?? []).map((x) => (x as { toString: () => string }).toString())
    );

    const title = await senderDisplayName(params.senderUserId);
    const io = getSocketIOServer();

    for (const p of conv.participantIds) {
      const recipientId = p.toString();
      if (recipientId === params.senderUserId) continue;
      if (await usersBlockEachOther(params.senderUserId, recipientId)) continue;

      if (io) {
        try {
          const sockets = await io.in(`user:${recipientId}`).fetchSockets();
          if (sockets.length > 0) continue;
        } catch (e) {
          logError("[push] fetchSockets failed", e);
        }
      }

      const user = await User.findById(recipientId).select("pushSubscriptions").lean();
      const subs = (user?.pushSubscriptions ?? []) as LeanSub[];
      if (!subs.length) continue;

      const rel = `/chat?c=${encodeURIComponent(params.conversationId)}`;
      const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || params.appOrigin;
      let url: string;
      try {
        url = new URL(rel, base).href;
      } catch {
        url = `${params.appOrigin}${rel}`;
      }
      const tag = `chat-${params.conversationId}`;

      for (const sub of subs) {
        const locale = resolveLocaleForPush(sub.locale);
        const privacyLock = lockedSet.has(recipientId);
        const body = notificationBodyForMessage(params.message, locale, { privacyLock });
        const pushTitle = privacyLock ? notificationTitleForLockedChat(locale) : title;
        const payload = JSON.stringify({ title: pushTitle, body, url, tag });

        try {
          await webpush.sendNotification(toWebPushSubscription(sub), payload, {
            TTL: 60,
            urgency: "high",
          });
          devLog(`[push] sent to user ${recipientId} endpoint=${sub.endpoint.slice(0, 48)}…`);
        } catch (e: unknown) {
          const status =
            e && typeof e === "object" && "statusCode" in e
              ? Number((e as { statusCode: unknown }).statusCode)
              : 0;
          if (status === 404 || status === 410) {
            await User.updateOne(
              { _id: recipientId },
              { $pull: { pushSubscriptions: { endpoint: sub.endpoint } } }
            );
            devLog(`[push] removed stale subscription for user ${recipientId}`);
          } else {
            logError("[push] sendNotification failed", e);
          }
        }
      }
    }
  } catch (e) {
    logError("[push] notifyNewMessageViaWebPush failed", e);
  }
}
