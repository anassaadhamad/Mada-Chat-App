"use client";

import type { Locale } from "@/i18n/config";
import type { ChatMessage } from "@/lib/chat-types";
import { stripSpoilerSpansForPreview } from "@/lib/chat-preview";

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function notificationBodyFromMessage(
  message: Pick<ChatMessage, "content" | "fileUrl" | "fileType" | "fileName" | "deleted">,
  t: (key: string, params?: Record<string, string | number>) => string,
  options?: { privacyLock?: boolean }
): string {
  if (options?.privacyLock) return t("notifications.lockedChatBody");
  if (message.deleted) return t("notifications.bodyDeleted");
  if (message.fileType === "image" && message.fileUrl) return t("notifications.bodyPhoto");
  if (message.fileType === "video" && message.fileUrl) return t("notifications.bodyVideo");
  if (message.fileType === "audio" && message.fileUrl) return t("notifications.bodyVoice");
  if (message.fileUrl && message.fileName) {
    return t("notifications.bodyFileNamed", { name: message.fileName.slice(0, 80) });
  }
  if (message.fileUrl) return t("notifications.bodyFile");
  return stripSpoilerSpansForPreview((message.content ?? "").trim()).slice(0, 200);
}

export function incomingMessageNotificationTitle(
  peerLabel: string | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
  options?: { privacyLock?: boolean }
): string {
  if (options?.privacyLock) return t("notifications.lockedChatTitle");
  const s = peerLabel?.trim();
  if (s) return s.slice(0, 120);
  return t("notifications.unknownSender");
}

export async function ensureChatServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

export async function ensureNotificationPermissionForSocket(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export async function syncPushSubscription(
  registration: ServiceWorkerRegistration,
  locale: Locale
): Promise<void> {
  const res = await fetch("/api/push/vapid-public-key");
  if (!res.ok) return;
  const data = (await res.json()) as { publicKey?: string | null };
  const publicKey = data.publicKey;
  if (!publicKey) return;

  const converted = urlBase64ToUint8Array(publicKey);
  let sub = await registration.pushManager.getSubscription();
  if (!sub) {
    sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array(converted) as BufferSource,
    });
  }

  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      locale,
      subscription: sub.toJSON(),
    }),
  });
}

export async function registerChatNotifications(
  locale: Locale,
  pushNotificationsEnabled = true
): Promise<ServiceWorkerRegistration | null> {
  const reg = await ensureChatServiceWorker();
  if (!reg) return null;

  if (!pushNotificationsEnabled) {
    await ensureNotificationPermissionForSocket();
    return reg;
  }

  const vapidRes = await fetch("/api/push/vapid-public-key");
  const vapidJson = vapidRes.ok ? ((await vapidRes.json()) as { publicKey?: string | null }) : {};
  if (vapidJson.publicKey) {
    await syncPushSubscription(reg, locale);
  } else {
    await ensureNotificationPermissionForSocket();
  }
  return reg;
}

export function shouldShowSocketBrowserNotification(opts: {
  message: ChatMessage;
  selfUserId: string;
  activeConversationId: string | null;
  threadIsOpenInUi: () => boolean;
}): boolean {
  if (opts.message.systemNotice) return false;
  if (opts.message.senderId === opts.selfUserId) return false;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  if (typeof document === "undefined") return false;

  if (document.visibilityState === "hidden") return true;
  if (opts.activeConversationId !== opts.message.conversationId) return true;
  if (!opts.threadIsOpenInUi()) return true;
  if (document.visibilityState !== "visible") return true;
  return false;
}

export async function showIncomingMessageNotification(
  registration: ServiceWorkerRegistration,
  opts: { title: string; body: string; url: string; tag: string }
): Promise<void> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  await registration.showNotification(opts.title, {
    body: opts.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: opts.tag,
    data: { url: opts.url },
  });
}
