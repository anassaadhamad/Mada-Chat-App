"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { useSession } from "next-auth/react";
import type {
  ChatMessage,
  Conversation,
  MessageReactionSummary,
  PeerProfileSocketPayload,
  UserBlockedSocketPayload,
  ConversationPinSocketPayload,
} from "@/lib/chat-types";
import { chatPreviewLine } from "@/lib/chat-preview";
import { classifyLocalFile } from "@/lib/classify-local-file";
import { describeUploadError } from "@/lib/describe-upload-error";
import { formatFileSize } from "@/lib/format-file-size";
import { formatBytesAndSpeed } from "@/lib/format-transfer-speed";
import { getClientUploadMaxBytes } from "@/lib/upload-config";
import { envPublicChatHistoryFetchLimit, publicApiUrl } from "@/lib/env-public";
import { buildAiClientClockPayload } from "@/lib/ai-client-clock";
import { uploadFileWithProgress } from "@/lib/upload-with-progress";
import { validateClientFileBeforeUpload } from "@/lib/upload-validation";
import { setChatCachePersistScope } from "@/lib/chat-cache-storage";
import { getSocket } from "@/lib/socket-client";
import {
  ensureUiSoundsUnlocked,
  playMessageReceive,
  playMessageSend,
  startIncomingCallRing,
  stopIncomingCallRing,
} from "@/lib/ui-sounds";
import {
  incomingMessageNotificationTitle,
  notificationBodyFromMessage,
  registerChatNotifications,
  shouldShowSocketBrowserNotification,
  showIncomingMessageNotification,
} from "@/lib/message-notifications-client";
import { ConversationSidebar } from "@/components/chat/conversation-sidebar";
import { ChatVaultPinSetupDialog } from "@/components/chat/chat-vault-pin-setup";
import { MessageThread } from "@/components/chat/message-thread";
import { CallContainer } from "@/components/chat/call-container";
import type { VaultUnlockLabels } from "@/components/chat/vault-unlock-modal";
import { Button } from "@/components/ui/button";
import { UserInfoPanel } from "@/components/chat/user-info-panel";
import type { AttachmentDraftUi } from "@/components/chat/message-input";
import { useShallow } from "zustand/react/shallow";
import { useChatStore } from "@/stores/chat-store";
import { useI18n } from "@/components/i18n/i18n-provider";
import { useUserPreferencesOptional } from "@/components/preferences/user-preferences-context";
import { useAppLockOptional } from "@/components/preferences/app-lock-provider";

const CHAT_HISTORY_PAGE_LIMIT = envPublicChatHistoryFetchLimit();

/** Stable empty list for `useShallow` — inline `[]` is a new reference each run → infinite re-renders (React #185). */
const EMPTY_CHAT_MESSAGES: ChatMessage[] = [];

function isConversationMessagingBlocked(conversationId: string): boolean {
  const c = useChatStore.getState().conversations.find((x) => x.id === conversationId);
  return !!(c?.blockedByMe || c?.blockedByPeer);
}

export type ChatShellProps = {
  userId: string;
  userName: string | null;
  userEmail: string | null;
  userImage?: string | null;
  /** Deep link from notifications: `/chat?c=<conversationId>` */
  initialConversationId?: string | null;
  /** When true, voice/video call UI is available (Zego env configured on server). */
  zegoCallsEnabled?: boolean;
};

export function ChatShell({
  userId,
  userName,
  userEmail,
  userImage: userImageProp = null,
  initialConversationId = null,
  zegoCallsEnabled = false,
}: ChatShellProps) {
  const { t, locale } = useI18n();
  const { data: sessionData } = useSession();
  const su = sessionData?.user;
  const userPrefsCtx = useUserPreferencesOptional();
  const readReceiptsEnabledRef = useRef(true);
  useEffect(() => {
    readReceiptsEnabledRef.current = userPrefsCtx?.preferences?.readReceiptsEnabled !== false;
  }, [userPrefsCtx?.preferences?.readReceiptsEnabled]);

  const chatWallpaper = userPrefsCtx?.preferences?.chatWallpaper ?? "";
  const chatShellBgStyle = useMemo((): CSSProperties | undefined => {
    const w = chatWallpaper.trim();
    if (!w) return undefined;
    if (w.startsWith("#")) {
      return { backgroundColor: w };
    }
    const src =
      w.startsWith("/") && typeof window !== "undefined" ? `${window.location.origin}${w}` : w;
    return {
      backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.25), rgba(0,0,0,0.35)), url(${src})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }, [chatWallpaper]);

  const conversations = useChatStore((s) => s.conversations);
  const appLock = useAppLockOptional();
  const hasAppLock = !!appLock?.hasAppLock;

  const mainConversations = useMemo(
    () => conversations.filter((c) => !c.isLockedByMe),
    [conversations]
  );
  const lockedConversations = useMemo(
    () => conversations.filter((c) => c.isLockedByMe),
    [conversations]
  );
  const lockedCount = lockedConversations.length;

  const vaultSessionKey = useMemo(() => `secret-chat-locked-vault:${userId}`, [userId]);

  const setConversations = useChatStore((s) => s.setConversations);
  const upsertConversation = useChatStore((s) => s.upsertConversation);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const activeConversationIdRef = useRef(activeConversationId);
  activeConversationIdRef.current = activeConversationId;
  const setActiveConversationId = useChatStore((s) => s.setActiveConversationId);
  /** Narrow slice + shallow compare: other conversations' message/draft updates won't re-render ChatShell. */
  const { activeMessages, activeDraft } = useChatStore(
    useShallow((s) => {
      const id = s.activeConversationId;
      return {
        activeMessages: id ? (s.messagesByConversationId[id] ?? EMPTY_CHAT_MESSAGES) : EMPTY_CHAT_MESSAGES,
        activeDraft: id ? (s.draftByConversationId[id] ?? "") : "",
      };
    })
  );
  const setDraft = useChatStore((s) => s.setDraft);
  const mergeMessagesFromHistoryFetch = useChatStore((s) => s.mergeMessagesFromHistoryFetch);
  const prependOlderMessages = useChatStore((s) => s.prependOlderMessages);
  const addOptimisticMessage = useChatStore((s) => s.addOptimisticMessage);
  const confirmOptimisticMessage = useChatStore((s) => s.confirmOptimisticMessage);
  const markMessageFailed = useChatStore((s) => s.markMessageFailed);
  const setPeerTyping = useChatStore((s) => s.setPeerTyping);
  const applyPresence = useChatStore((s) => s.applyPresence);
  const clearUnread = useChatStore((s) => s.clearUnread);
  const peerReadAtByConversationId = useChatStore((s) => s.peerReadAtByConversationId);
  const applyMessageUpdate = useChatStore((s) => s.applyMessageUpdate);
  const patchMessageInConversation = useChatStore((s) => s.patchMessageInConversation);
  const patchConversationIsLocked = useChatStore((s) => s.patchConversationIsLocked);
  const patchConversationPin = useChatStore((s) => s.patchConversationPin);
  const patchConversationDisappearing = useChatStore((s) => s.patchConversationDisappearing);

  const mobileTabRef = useRef<"list" | "thread">("list");
  const [mobileTab, setMobileTab] = useState<"list" | "thread">("list");
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine
  );
  const [peerPanelConversationId, setPeerPanelConversationId] = useState<string | null>(null);
  const [lockedVaultMode, setLockedVaultMode] = useState<"closed" | "auth" | "list">("closed");
  const [chatVaultSetupOpen, setChatVaultSetupOpen] = useState(false);
  const [chatVaultConfigured, setChatVaultConfigured] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<{
    conversationId: string;
    text: string;
    directive: string;
  } | null>(null);

  type IncomingCallPayload = {
    conversationId: string;
    callType: "voice" | "video";
    fromUserId: string;
    fromUserName: string;
  };
  const [incomingCall, setIncomingCall] = useState<IncomingCallPayload | null>(null);
  const [activeCall, setActiveCall] = useState<{ conversationId: string; mode: "voice" | "video" } | null>(
    null
  );
  const incomingCallRef = useRef<IncomingCallPayload | null>(null);
  const activeCallRef = useRef(activeCall);
  useLayoutEffect(() => {
    incomingCallRef.current = incomingCall;
    activeCallRef.current = activeCall;
  }, [incomingCall, activeCall]);

  useEffect(() => {
    mobileTabRef.current = mobileTab;
  }, [mobileTab]);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    if (typeof window === "undefined") return undefined;
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    ensureUiSoundsUnlocked();
  }, []);

  useEffect(() => {
    if (!incomingCall || !zegoCallsEnabled) {
      stopIncomingCallRing();
      return;
    }
    startIncomingCallRing();
    return () => {
      stopIncomingCallRing();
    };
  }, [incomingCall, zegoCallsEnabled]);

  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [attachmentDraft, setAttachmentDraft] = useState<{ file: File; previewUrl: string } | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const uploadAbortByClientIdRef = useRef<Map<string, AbortController>>(new Map());
  const pendingUploadFileByClientIdRef = useRef<Map<string, File>>(new Map());
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingBurstActiveRef = useRef(false);
  const markReadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inboundMarkReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevActiveConversationId = useRef<string | null>(null);
  const hasOlderMessagesRef = useRef(false);
  const [hasOlderHistory, setHasOlderHistory] = useState(false);
  /** Avoids re-emitting `conversation:join` on every store-driven re-render (same active id). Cleared on connect/reconnect. */
  const lastExplicitJoinConvIdRef = useRef<string | null>(null);
  /** Throttles HTTP catch-up merges for the open thread (missed `message:new` while disconnected / backgrounded). */
  const lastActiveThreadCatchUpAtRef = useRef(0);
  const catchUpActiveThreadMessagesRef = useRef<() => void>(() => {});
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const tRef = useRef(t);
  const handledDeepLinkRef = useRef<string | null>(null);

  const syncSocketRooms = useCallback(() => {
    const sock = getSocket();
    if (!sock.connected) return;
    const { conversations: convs, activeConversationId: active } = useChatStore.getState();
    const ids = convs.map((c) => c.id);
    if (ids.length) {
      sock.emit("conversations:sync", ids);
    }
    if (!active) {
      lastExplicitJoinConvIdRef.current = null;
      return;
    }
    if (lastExplicitJoinConvIdRef.current === active) {
      return;
    }
    lastExplicitJoinConvIdRef.current = active;
    sock.emit(
      "conversation:join",
      active,
      (res: { ok?: boolean; onlineUserIds?: string[] }) => {
        if (res?.ok && Array.isArray(res.onlineUserIds)) {
          applyPresence(active, res.onlineUserIds);
        }
      }
    );
  }, [applyPresence]);

  const syncSocketRoomsRef = useRef(syncSocketRooms);

  useEffect(() => {
    syncSocketRoomsRef.current = syncSocketRooms;
  }, [syncSocketRooms]);

  /** Stable key so preview/unread updates do not re-run socket room sync (was an infinite join ↔ presence loop). */
  const conversationIdsKey = useMemo(
    () =>
      [...conversations.map((c) => c.id)]
        .sort()
        .join("|"),
    [conversations]
  );

  const refreshConversations = useCallback(async () => {
    try {
      const res = await fetch(publicApiUrl("/api/conversations"));
      if (!res.ok) return;
      const data = (await res.json()) as {
        conversations: {
          id: string;
          peerLabel: string;
          peerUserId: string;
          peerAvatarUrl?: string | null;
          peerBio?: string;
          peerEmail?: string;
          lastMessagePreview: string;
          updatedAt: number;
          unreadCount?: number;
          peerLastReadAt?: number;
          peerLastSeenAt?: number | null;
          blockedByMe?: boolean;
          blockedByPeer?: boolean;
          isLockedByMe?: boolean;
          disappearingMessageSeconds?: number | null;
          isPinnedByMe?: boolean;
          pinnedAtMs?: number;
        }[];
      };
      const prev = useChatStore.getState().conversations;
      const peerOnlineById = new Map(prev.map((c) => [c.id, c.peerOnline]));
      const mapped = data.conversations.map((c) => {
        const blockedByMe = c.blockedByMe ?? false;
        const blockedByPeer = c.blockedByPeer ?? false;
        const prevOnline = peerOnlineById.get(c.id) ?? false;
        const peerOnline =
          blockedByMe || blockedByPeer ? false : prevOnline;
        return {
          ...c,
          peerAvatarUrl: c.peerAvatarUrl ?? null,
          peerBio: c.peerBio ?? "",
          peerEmail: c.peerEmail ?? "",
          peerOnline,
          unreadCount: c.unreadCount ?? 0,
          peerLastReadAt: c.peerLastReadAt ?? 0,
          peerLastSeenAt: c.peerLastSeenAt ?? null,
          blockedByMe,
          blockedByPeer,
          isLockedByMe: c.isLockedByMe ?? false,
          disappearingMessageSeconds: c.disappearingMessageSeconds ?? null,
          isPinnedByMe: c.isPinnedByMe ?? false,
          pinnedAtMs: c.pinnedAtMs ?? 0,
        };
      });
      setConversations(mapped);
    } catch {
      /* ignore */
    }
  }, [setConversations]);

  const scheduleMarkRead = useCallback((conversationId: string) => {
    if (!readReceiptsEnabledRef.current) return;
    if (isConversationMessagingBlocked(conversationId)) return;
    if (markReadDebounceRef.current) {
      clearTimeout(markReadDebounceRef.current);
    }
    markReadDebounceRef.current = setTimeout(() => {
      markReadDebounceRef.current = null;
      if (!readReceiptsEnabledRef.current) return;
      if (isConversationMessagingBlocked(conversationId)) return;
      void fetch(publicApiUrl(`/api/conversations/${conversationId}/read`), { method: "POST" });
    }, 450);
  }, []);

  /** True when the message thread is the surface the user is actually looking at (not the mobile list). */
  const threadIsOpenInUi = useCallback((): boolean => {
    if (typeof window === "undefined") return false;
    if (window.matchMedia("(min-width: 768px)").matches) return true;
    return mobileTabRef.current === "thread";
  }, []);

  const threadIsOpenInUiRef = useRef(threadIsOpenInUi);
  useLayoutEffect(() => {
    threadIsOpenInUiRef.current = threadIsOpenInUi;
  }, [threadIsOpenInUi]);

  useLayoutEffect(() => {
    tRef.current = t;
  }, [t]);

  /**
   * Read receipt for inbound socket messages — POST after a short debounce if this thread is the
   * active one and the tab is visible. We intentionally do not require `document.hasFocus()` so
   * read receipts still fire when the window is visible but not focused (second monitor, DevTools,
   * etc.). `conversation:read` is broadcast from the POST handler.
   */
  const scheduleMarkReadOnInboundMessage = useCallback(
    (conversationId: string) => {
      if (typeof document === "undefined") return;
      if (isConversationMessagingBlocked(conversationId)) return;
      const { activeConversationId: openId } = useChatStore.getState();
      if (openId !== conversationId) return;
      if (!threadIsOpenInUi()) return;
      if (document.visibilityState !== "visible") return;

      if (inboundMarkReadTimerRef.current) {
        clearTimeout(inboundMarkReadTimerRef.current);
      }
      inboundMarkReadTimerRef.current = setTimeout(() => {
        inboundMarkReadTimerRef.current = null;
        const { activeConversationId: stillOpen } = useChatStore.getState();
        if (stillOpen !== conversationId) return;
        if (!threadIsOpenInUi()) return;
        if (document.visibilityState !== "visible") return;
        if (isConversationMessagingBlocked(conversationId)) return;
        if (!readReceiptsEnabledRef.current) return;
        void fetch(publicApiUrl(`/api/conversations/${conversationId}/read`), { method: "POST" });
      }, 320);
    },
    [threadIsOpenInUi]
  );

  const catchUpActiveThreadMessages = () => {
    const cid = activeConversationIdRef.current;
    if (!cid) return;
    const now = Date.now();
    if (now - lastActiveThreadCatchUpAtRef.current < 1200) return;
    lastActiveThreadCatchUpAtRef.current = now;
    void (async () => {
      try {
        const res = await fetch(publicApiUrl(`/api/conversations/${encodeURIComponent(cid)}/messages`), {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { messages?: ChatMessage[]; peerReadAt?: number };
        if (!Array.isArray(data.messages)) return;
        useChatStore.getState().mergeMessagesFromHistoryFetch(cid, data.messages, data.peerReadAt);
      } catch {
        /* ignore */
      }
    })();
  };
  catchUpActiveThreadMessagesRef.current = catchUpActiveThreadMessages;

  /** When the user returns to a visible tab/window with the thread open, mark read immediately. */
  useEffect(() => {
    const markIfViewing = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;
      if (!threadIsOpenInUi()) return;
      const { activeConversationId: id } = useChatStore.getState();
      if (!id) return;
      if (isConversationMessagingBlocked(id)) return;
      if (!readReceiptsEnabledRef.current) return;
      void fetch(publicApiUrl(`/api/conversations/${id}/read`), { method: "POST" });
    };
    document.addEventListener("visibilitychange", markIfViewing);
    window.addEventListener("focus", markIfViewing);
    return () => {
      document.removeEventListener("visibilitychange", markIfViewing);
      window.removeEventListener("focus", markIfViewing);
    };
  }, [threadIsOpenInUi]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const pushOn = userPrefsCtx?.preferences?.pushNotificationsEnabled !== false;
      const reg = await registerChatNotifications(locale, pushOn);
      if (!cancelled) swRegistrationRef.current = reg;
    })();
    return () => {
      cancelled = true;
    };
  }, [locale, userPrefsCtx?.preferences?.pushNotificationsEnabled]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMsg = (ev: MessageEvent) => {
      if (ev.data?.type === "SECRET_CHAT_NAVIGATE" && typeof ev.data.url === "string") {
        window.location.href = ev.data.url;
      }
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    if (!initialConversationId) return;
    if (handledDeepLinkRef.current === initialConversationId) return;
    const exists = conversations.some((c) => c.id === initialConversationId);
    if (!exists) return;
    handledDeepLinkRef.current = initialConversationId;
    setActiveConversationId(initialConversationId);
    setMobileTab("thread");
    if (typeof window !== "undefined") {
      const u = new URL(window.location.href);
      u.searchParams.delete("c");
      const next = `${u.pathname}${u.search}${u.hash}`;
      window.history.replaceState(null, "", next || "/chat");
    }
  }, [initialConversationId, conversations, setActiveConversationId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(publicApiUrl("/api/me/chat-vault"), { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as { configured?: boolean };
        if (!cancelled) setChatVaultConfigured(!!data.configured);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    return () => {
      if (typingStopTimer.current) {
        clearTimeout(typingStopTimer.current);
      }
      if (markReadDebounceRef.current) {
        clearTimeout(markReadDebounceRef.current);
      }
      if (inboundMarkReadTimerRef.current) {
        clearTimeout(inboundMarkReadTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const prev = prevActiveConversationId.current;
    if (prev && prev !== activeConversationId) {
      setPeerTyping(prev, false);
      if (typingStopTimer.current) {
        clearTimeout(typingStopTimer.current);
        typingStopTimer.current = null;
      }
      if (typingBurstActiveRef.current) {
        const s = getSocket();
        if (s.connected) {
          s.emit("typing:stop", { conversationId: prev });
        }
        typingBurstActiveRef.current = false;
      }
    }
    prevActiveConversationId.current = activeConversationId;
  }, [activeConversationId, setPeerTyping]);

  useEffect(() => {
    setEditingMessage(null);
  }, [activeConversationId]);

  useEffect(() => {
    setChatCachePersistScope(userId);
    let cancelled = false;
    void (async () => {
      await useChatStore.persist.rehydrate();
      if (cancelled) return;
      await refreshConversations();
      if (cancelled) return;
      const { activeConversationId: current, conversations: list } = useChatStore.getState();
      if (list.length > 0 && !current) {
        const isMdOrWider =
          typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
        if (!isMdOrWider) {
          setActiveConversationId(list[0]!.id);
        }
      }
    })();
    return () => {
      cancelled = true;
      setChatCachePersistScope(null);
    };
  }, [userId, refreshConversations, setActiveConversationId]);

  useEffect(() => {
    setAiSuggestion(null);
  }, [activeConversationId]);

  const userIdRef = useRef(userId);
  const refreshConversationsRef = useRef(refreshConversations);
  const scheduleMarkReadOnInboundMessageRef = useRef(scheduleMarkReadOnInboundMessage);

  useLayoutEffect(() => {
    userIdRef.current = userId;
    refreshConversationsRef.current = refreshConversations;
    scheduleMarkReadOnInboundMessageRef.current = scheduleMarkReadOnInboundMessage;
  }, [userId, refreshConversations, scheduleMarkReadOnInboundMessage]);

  const handleRequestCall = useCallback(
    (kind: "voice" | "video") => {
      if (!zegoCallsEnabled) return;
      setIncomingCall(null);
      const cid = useChatStore.getState().activeConversationId;
      if (!cid) return;
      const sock = getSocket();
      if (sock.connected) {
        sock.emit("call:invite", { conversationId: cid, callType: kind });
      }
      setActiveCall({ conversationId: cid, mode: kind });
    },
    [zegoCallsEnabled]
  );

  const declineIncomingCall = useCallback(() => {
    stopIncomingCallRing();
    setIncomingCall(null);
  }, []);

  const acceptIncomingCall = useCallback(() => {
    const cur = incomingCallRef.current;
    if (!cur) return;
    stopIncomingCallRing();
    setIncomingCall(null);
    setActiveConversationId(cur.conversationId);
    setMobileTab("thread");
    setActiveCall({ conversationId: cur.conversationId, mode: cur.callType });
  }, [setActiveConversationId]);

  useEffect(() => {
    if (!zegoCallsEnabled) return undefined;
    const socket = getSocket();
    const onCallIncoming = (payload: unknown) => {
      if (!payload || typeof payload !== "object") return;
      const p = payload as Record<string, unknown>;
      const conversationId = typeof p.conversationId === "string" ? p.conversationId : "";
      const callType = p.callType;
      const fromUserId = typeof p.fromUserId === "string" ? p.fromUserId : "";
      const fromUserName = typeof p.fromUserName === "string" ? p.fromUserName : "";
      if (!conversationId || !fromUserId) return;
      if (fromUserId === userIdRef.current) return;
      if (callType !== "voice" && callType !== "video") return;
      if (activeCallRef.current) return;
      setIncomingCall({
        conversationId,
        callType,
        fromUserId,
        fromUserName: fromUserName || tRef.current("notifications.unknownSender"),
      });
    };
    socket.on("call:incoming", onCallIncoming);
    return () => {
      socket.off("call:incoming", onCallIncoming);
    };
  }, [zegoCallsEnabled]);

  useEffect(() => {
    const socket = getSocket();
    socket.connect();

    const runRoomSync = () => {
      lastExplicitJoinConvIdRef.current = null;
      syncSocketRoomsRef.current();
    };

    let catchUpAfterConnectTimer: ReturnType<typeof setTimeout> | null = null;
    const onSocketSessionReady = () => {
      runRoomSync();
      if (catchUpAfterConnectTimer) clearTimeout(catchUpAfterConnectTimer);
      catchUpAfterConnectTimer = setTimeout(() => {
        catchUpAfterConnectTimer = null;
        catchUpActiveThreadMessagesRef.current();
      }, 400);
    };

    const onMessageNew = (payload: { message: ChatMessage }) => {
      const uid = userIdRef.current;
      const msg = payload.message;
      const {
        activeConversationId: openId,
        conversations: currentList,
        messagesByConversationId: msgsByConv,
        appendRemoteMessage,
        incrementUnread,
      } = useChatStore.getState();
      const alreadyHad = (msgsByConv[msg.conversationId] ?? []).some((m) => m.id === msg.id);
      const knownConversation = currentList.some((c) => c.id === msg.conversationId);
      appendRemoteMessage(msg);
      if (!knownConversation) {
        void refreshConversationsRef.current();
      }
      if (msg.senderId !== uid && msg.conversationId !== openId && !msg.systemNotice) {
        incrementUnread(msg.conversationId);
      }
      if (
        typeof document !== "undefined" &&
        !alreadyHad &&
        msg.senderId !== uid &&
        !msg.systemNotice
      ) {
        const viewingThisThread =
          openId === msg.conversationId &&
          document.visibilityState === "visible" &&
          threadIsOpenInUiRef.current();
        if (!viewingThisThread) {
          playMessageReceive(msg.id);
        }
      }
      if (msg.senderId !== uid) {
        const convRow = currentList.find((c) => c.id === msg.conversationId);
        const privacyLock = !!convRow?.isLockedByMe;
        const peer = convRow?.peerLabel;
        const reg = swRegistrationRef.current;
        if (
          !msg.systemNotice &&
          reg &&
          shouldShowSocketBrowserNotification({
            message: msg,
            selfUserId: uid,
            activeConversationId: openId,
            threadIsOpenInUi: () => threadIsOpenInUiRef.current(),
          })
        ) {
          const title = incomingMessageNotificationTitle(peer, tRef.current, { privacyLock });
          const body = notificationBodyFromMessage(msg, tRef.current, { privacyLock });
          const origin = typeof window !== "undefined" ? window.location.origin : "";
          const url = `${origin}/chat?c=${encodeURIComponent(msg.conversationId)}`;
          void showIncomingMessageNotification(reg, {
            title,
            body,
            url,
            tag: `chat-${msg.conversationId}`,
          });
        }
      }
      if (
        msg.senderId !== uid &&
        openId &&
        msg.conversationId === openId &&
        !isConversationMessagingBlocked(openId)
      ) {
        scheduleMarkReadOnInboundMessageRef.current(openId);
      }
    };

    const onConversationRead = (payload: { conversationId: string; readerId: string; readAt: number }) => {
      if (payload.readerId === userIdRef.current) return;
      useChatStore.getState().setPeerReadAt(payload.conversationId, payload.readAt);
    };

    const onTyping = (payload: { conversationId: string; userId: string; typing: boolean }) => {
      if (payload.userId === userIdRef.current) return;
      useChatStore.getState().setPeerTyping(payload.conversationId, payload.typing);
    };

    const onPresence = (payload: { conversationId: string; onlineUserIds: string[] }) => {
      useChatStore.getState().applyPresence(payload.conversationId, payload.onlineUserIds);
    };

    const onMessageReactions = (payload: {
      conversationId: string;
      messageId: string;
      reactions: MessageReactionSummary[];
    }) => {
      if (!payload?.conversationId || !payload?.messageId || !Array.isArray(payload.reactions)) return;
      useChatStore
        .getState()
        .applyMessageReactions(payload.conversationId, payload.messageId, payload.reactions);
    };

    const onMessageUpdated = (payload: { message?: ChatMessage }) => {
      const msg = payload?.message;
      if (!msg?.conversationId || !msg.id) return;
      useChatStore.getState().applyMessageUpdate(msg.conversationId, msg);
    };

    const onUserBlocked = (payload: UserBlockedSocketPayload) => {
      if (!payload?.blockerId || !payload?.blockedUserId) return;
      const uid = userIdRef.current;
      const patchFlags = useChatStore.getState().patchConversationBlockFlags;
      const setTyping = useChatStore.getState().setPeerTyping;
      if (payload.conversationId) {
        const conv = useChatStore.getState().conversations.find((c) => c.id === payload.conversationId);
        if (!conv) {
          void refreshConversationsRef.current();
          return;
        }
        let blockedByMe = conv.blockedByMe ?? false;
        let blockedByPeer = conv.blockedByPeer ?? false;
        if (uid === payload.blockerId) blockedByMe = !!payload.blocked;
        if (uid === payload.blockedUserId) blockedByPeer = !!payload.blocked;
        patchFlags(payload.conversationId, { blockedByMe, blockedByPeer });
        setTyping(payload.conversationId, false);
      } else {
        void refreshConversationsRef.current();
      }
    };

    const onPeerProfile = (payload: unknown) => {
      if (!payload || typeof payload !== "object") return;
      useChatStore.getState().applyPeerProfileFromSocket(payload as PeerProfileSocketPayload);
    };

    const onConversationDisappearing = (payload: {
      conversationId?: string;
      disappearingMessageSeconds?: number | null;
    }) => {
      if (!payload?.conversationId) return;
      useChatStore.getState().patchConversationDisappearing(
        payload.conversationId,
        payload.disappearingMessageSeconds ?? null
      );
    };

    const onMessagesDisappearScheduled = (payload: {
      conversationId?: string;
      updates?: { id: string; disappearExpiresAt: number; disappearStartedAt: number }[];
    }) => {
      if (!payload?.conversationId || !payload.updates?.length) return;
      useChatStore.getState().patchMessagesDisappearSchedule(payload.conversationId, payload.updates);
    };

    const onMessagesRemoved = (payload: { conversationId?: string; messageIds?: string[] }) => {
      if (!payload?.conversationId || !payload.messageIds?.length) return;
      useChatStore.getState().removeMessagesByIds(payload.conversationId, payload.messageIds);
    };

    const onConversationPin = (payload: ConversationPinSocketPayload) => {
      if (!payload?.conversationId || typeof payload.pinned !== "boolean") return;
      const at = payload.pinned ? Number(payload.pinnedAtMs) || Date.now() : 0;
      patchConversationPin(payload.conversationId, payload.pinned, at);
    };

    socket.on("peer:profile", onPeerProfile);
    socket.on("connect", onSocketSessionReady);
    socket.on("reconnect", onSocketSessionReady);
    socket.on("message:new", onMessageNew);
    socket.on("message:updated", onMessageUpdated);
    socket.on("conversation:read", onConversationRead);
    socket.on("typing:update", onTyping);
    socket.on("presence:conversation", onPresence);
    socket.on("message:reactions", onMessageReactions);
    socket.on("user:blocked", onUserBlocked);
    socket.on("conversation:disappearing", onConversationDisappearing);
    socket.on("conversation:pin", onConversationPin);
    socket.on("messages:disappear-scheduled", onMessagesDisappearScheduled);
    socket.on("messages:removed", onMessagesRemoved);

    return () => {
      if (catchUpAfterConnectTimer) clearTimeout(catchUpAfterConnectTimer);
      socket.off("connect", onSocketSessionReady);
      socket.off("reconnect", onSocketSessionReady);
      socket.off("message:new", onMessageNew);
      socket.off("message:updated", onMessageUpdated);
      socket.off("conversation:read", onConversationRead);
      socket.off("typing:update", onTyping);
      socket.off("presence:conversation", onPresence);
      socket.off("message:reactions", onMessageReactions);
      socket.off("user:blocked", onUserBlocked);
      socket.off("peer:profile", onPeerProfile);
      socket.off("conversation:disappearing", onConversationDisappearing);
      socket.off("conversation:pin", onConversationPin);
      socket.off("messages:disappear-scheduled", onMessagesDisappearScheduled);
      socket.off("messages:removed", onMessagesRemoved);
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      catchUpActiveThreadMessagesRef.current();
      const cid = activeConversationIdRef.current;
      if (!cid) return;
      void (async () => {
        try {
          const res = await fetch(publicApiUrl(`/api/conversations/${cid}/disappearing-sweep`), {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          const data = (await res.json()) as { messageIds?: string[] };
          if (res.ok && data.messageIds?.length) {
            useChatStore.getState().removeMessagesByIds(cid, data.messageIds);
          }
        } catch {
          /* ignore */
        }
      })();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    window.addEventListener("pageshow", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
      window.removeEventListener("pageshow", onVis);
    };
  }, []);

  useEffect(() => {
    syncSocketRoomsRef.current();
    // Intentionally omit syncSocketRooms: always invoke latest via ref to avoid effect loops if callback identity changes.
  }, [activeConversationId, conversationIdsKey]);

  useEffect(() => {
    if (!activeConversationId) return;
    hasOlderMessagesRef.current = false;
    setHasOlderHistory(false);
    const { conversations: convs } = useChatStore.getState();
    const peer = convs.find((c) => c.id === activeConversationId);
    const hadUnread = (peer?.unreadCount ?? 0) > 0;
    clearUnread(activeConversationId);
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(publicApiUrl(`/api/conversations/${encodeURIComponent(activeConversationId)}/messages`), {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          messages: ChatMessage[];
          peerReadAt?: number;
          hasOlder?: boolean;
        };
        if (!cancelled) {
          mergeMessagesFromHistoryFetch(activeConversationId, data.messages, data.peerReadAt);
          const ho = data.hasOlder ?? false;
          hasOlderMessagesRef.current = ho;
          setHasOlderHistory(ho);
        }
        if (hadUnread) {
          scheduleMarkRead(activeConversationId);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
      if (markReadDebounceRef.current) {
        clearTimeout(markReadDebounceRef.current);
        markReadDebounceRef.current = null;
      }
      if (inboundMarkReadTimerRef.current) {
        clearTimeout(inboundMarkReadTimerRef.current);
        inboundMarkReadTimerRef.current = null;
      }
    };
  }, [activeConversationId, mergeMessagesFromHistoryFetch, clearUnread, scheduleMarkRead]);

  const fetchOlderMessages = useCallback(async (): Promise<boolean> => {
    const convId = activeConversationId;
    if (!convId) return false;
    if (!hasOlderMessagesRef.current) return false;
    const msgs = useChatStore.getState().messagesByConversationId[convId] ?? [];
    const oldestServer = msgs.find((m) => !m.id.startsWith("pending:"));
    if (!oldestServer) return false;
    const oldestId = oldestServer.id;
    try {
      const res = await fetch(
        publicApiUrl(
          `/api/conversations/${encodeURIComponent(convId)}/messages?before=${encodeURIComponent(oldestId)}&limit=${CHAT_HISTORY_PAGE_LIMIT}`
        ),
        { credentials: "include" }
      );
      if (!res.ok) {
        hasOlderMessagesRef.current = false;
        setHasOlderHistory(false);
        return false;
      }
      const data = (await res.json()) as { messages?: ChatMessage[]; hasOlder?: boolean };
      const batch = data.messages ?? [];
      if (!batch.length) {
        hasOlderMessagesRef.current = false;
        setHasOlderHistory(false);
        return false;
      }
      prependOlderMessages(convId, batch);
      const nextHas = data.hasOlder ?? false;
      hasOlderMessagesRef.current = nextHas;
      setHasOlderHistory(nextHas);
      return true;
    } catch {
      hasOlderMessagesRef.current = false;
      setHasOlderHistory(false);
      return false;
    }
  }, [activeConversationId, prependOlderMessages]);

  const activePeer = conversations.find((c) => c.id === activeConversationId) ?? null;
  const peerPanelData = useMemo(() => {
    if (!peerPanelConversationId) return null;
    return conversations.find((c) => c.id === peerPanelConversationId) ?? null;
  }, [peerPanelConversationId, conversations]);

  const openPeerPanel = useCallback((c: Conversation) => {
    setPeerPanelConversationId(c.id);
  }, []);

  const closePeerPanel = useCallback(() => {
    setPeerPanelConversationId(null);
  }, []);

  const messages = activeMessages;
  const draft = activeDraft;
  const executeAttachmentUpload = useCallback(
    async (
      conversationId: string,
      clientMessageId: string,
      file: File,
      trimmed: string,
      replyToMessageId: string | null
    ) => {
      const patch = useChatStore.getState().patchMessageInConversation;
      const confirm = useChatStore.getState().confirmOptimisticMessage;
      pendingUploadFileByClientIdRef.current.set(clientMessageId, file);
      const ac = new AbortController();
      uploadAbortByClientIdRef.current.set(clientMessageId, ac);

      try {
        const uploaded = await uploadFileWithProgress(file, {
          signal: ac.signal,
          onProgress: ({ progress, total, speedBps }) => {
            patch(conversationId, clientMessageId, {
              attachmentUpload: {
                phase: "uploading",
                progress,
                totalBytes: total,
                speedBps,
              },
            });
          },
        });

        patch(conversationId, clientMessageId, {
          attachmentUpload: { phase: "processing", progress: 100, totalBytes: file.size },
        });

        const res = await fetch(`/api/conversations/${conversationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: trimmed,
            ...(replyToMessageId ? { replyToMessageId } : {}),
            fileUrl: uploaded.url,
            fileType: uploaded.fileType,
            fileName: uploaded.fileName ?? file.name,
            ...(uploaded.fileSize != null ? { fileSize: uploaded.fileSize } : {}),
          }),
        });
        const data = (await res.json()) as { message?: ChatMessage; error?: string };
        if (!res.ok || !data.message) {
          const err = typeof data.error === "string" && data.error ? data.error : t("upload.errorGeneric");
          patch(conversationId, clientMessageId, {
            status: "failed",
            attachmentUpload: { phase: "uploading", progress: 0, error: err },
          });
          return;
        }
        confirm(clientMessageId, data.message);
        const socket = getSocket();
        if (socket.connected) {
          socket.emit("message:publish", { message: data.message });
        }
        pendingUploadFileByClientIdRef.current.delete(clientMessageId);
      } catch (e) {
        const err = describeUploadError(e, {
          cancelled: t("upload.cancelled"),
          generic: t("upload.errorGeneric"),
        });
        patch(conversationId, clientMessageId, {
          status: "failed",
          attachmentUpload: { phase: "uploading", progress: 0, error: err },
        });
      } finally {
        uploadAbortByClientIdRef.current.delete(clientMessageId);
        setUploadBusy(false);
      }
    },
    [t]
  );

  const activeUploadStrip = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]!;
      if (m.senderId !== userId) continue;
      if (m.status !== "sending") continue;
      if (!m.fileUrl?.startsWith("blob:")) continue;
      const au = m.attachmentUpload;
      if (!au || au.phase !== "uploading") continue;
      return {
        progress: au.progress,
        subtitle: formatBytesAndSpeed(au.totalBytes ?? m.fileSize ?? 0, au.speedBps ?? 0),
        onCancel: () => {
          uploadAbortByClientIdRef.current.get(m.id)?.abort();
        },
      };
    }
    return null;
  }, [messages, userId]);

  const onCancelAttachmentUpload = useCallback((m: ChatMessage) => {
    uploadAbortByClientIdRef.current.get(m.id)?.abort();
  }, []);

  const onRetryAttachmentUpload = useCallback(
    (m: ChatMessage) => {
      const file = pendingUploadFileByClientIdRef.current.get(m.id);
      if (!file) {
        patchMessageInConversation(m.conversationId, m.id, {
          attachmentUpload: {
            phase: "uploading",
            progress: 0,
            error: t("upload.retryNoFile"),
          },
        });
        return;
      }
      const row = useChatStore.getState().messagesByConversationId[m.conversationId]?.find((x) => x.id === m.id);
      const trimmed = row?.content?.trim() ?? "";
      const replyToMessageId =
        row?.replyTo && !row.replyTo.messageId.startsWith("pending:") ? row.replyTo.messageId : null;
      patchMessageInConversation(m.conversationId, m.id, {
        status: "sending",
        attachmentUpload: { phase: "uploading", progress: 0, totalBytes: file.size },
      });
      setUploadBusy(true);
      void executeAttachmentUpload(m.conversationId, m.id, file, trimmed, replyToMessageId);
    },
    [executeAttachmentUpload, patchMessageInConversation, t]
  );

  const peerTypingFromStore = useChatStore((s) =>
    s.activeConversationId ? !!s.peerTypingByConversationId[s.activeConversationId] : false
  );

  const activePeerReadAt = activeConversationId
    ? (peerReadAtByConversationId[activeConversationId] ?? 0)
    : 0;

  const replyPreview = useMemo(() => {
    if (!replyingTo || !activeConversationId) return null;
    const title =
      replyingTo.senderId === userId
        ? t("chat.replyPreviewYou")
        : (activePeer?.peerLabel ?? t("chat.replyPreviewMessage"));
    return { title, excerpt: chatPreviewLine(replyingTo).slice(0, 160) };
  }, [replyingTo, activeConversationId, userId, activePeer?.peerLabel, t]);

  const attachmentDraftUi = useMemo(() => {
    if (!attachmentDraft) return null;
    const t = attachmentDraft.file.type;
    const previewKind: AttachmentDraftUi["previewKind"] = t.startsWith("image/")
      ? "image"
      : t.startsWith("video/")
        ? "video"
        : t.startsWith("audio/")
          ? "audio"
          : "file";
    return {
      previewUrl: attachmentDraft.previewUrl,
      fileName: attachmentDraft.file.name,
      previewKind,
    };
  }, [attachmentDraft]);

  const userLabel = su?.name?.trim() || userName?.trim() || userEmail?.split("@")[0] || t("common.you");
  const userAvatarName = su?.name ?? userName;
  const userAvatarEmail = su?.email ?? userEmail;
  const rawAvatar = su?.image ?? userImageProp;
  const userAvatarImage =
    rawAvatar && String(rawAvatar).trim() !== "" ? String(rawAvatar).trim() : null;

  const clearAttachmentDraft = useCallback(() => {
    setAttachmentDraft((prev) => {
      if (prev?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }, []);

  const onPickFiles = useCallback((files: File[]) => {
    const f = files[0];
    if (!f) return;
    setUploadNotice(null);
    setAttachmentDraft((prev) => {
      if (prev?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(prev.previewUrl);
      return { file: f, previewUrl: URL.createObjectURL(f) };
    });
  }, []);

  const onSendRef = useRef<() => void>(() => {});

  const onVoiceConfirm = useCallback((file: File) => {
    flushSync(() => {
      setAttachmentDraft((prev) => {
        if (prev?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(prev.previewUrl);
        return { file, previewUrl: URL.createObjectURL(file) };
      });
    });
    onSendRef.current();
  }, []);

  const onSelect = useCallback(
    (id: string) => {
      const row = useChatStore.getState().conversations.find((c) => c.id === id);
      if (!row?.isLockedByMe) {
        if (typeof window !== "undefined") {
          sessionStorage.removeItem(`secret-chat-locked-vault:${userId}`);
        }
        setLockedVaultMode("closed");
      }
      clearAttachmentDraft();
      setReplyingTo(null);
      setEditingMessage(null);
      setActiveConversationId(id);
      setMobileTab("thread");
    },
    [setActiveConversationId, clearAttachmentDraft, userId, setLockedVaultMode]
  );

  const openLockedVault = useCallback(() => {
    if (lockedCount === 0) return;
    if (!chatVaultConfigured) {
      setChatVaultSetupOpen(true);
      return;
    }
    if (typeof window !== "undefined" && sessionStorage.getItem(vaultSessionKey) === "1") {
      setLockedVaultMode("list");
    } else {
      setLockedVaultMode("auth");
    }
  }, [chatVaultConfigured, lockedCount, vaultSessionKey]);

  const closeLockedVault = useCallback(() => {
    if (typeof window !== "undefined") sessionStorage.removeItem(vaultSessionKey);
    setLockedVaultMode("closed");
  }, [vaultSessionKey]);

  const onLockedVaultVerified = useCallback(() => {
    if (typeof window !== "undefined") sessionStorage.setItem(vaultSessionKey, "1");
    setLockedVaultMode("list");
  }, [vaultSessionKey]);

  const verifyVaultPasscode = useCallback(async (code: string) => {
    if (!/^\d{4}$/.test(code)) return false;
    try {
      const res = await fetch(publicApiUrl("/api/me/chat-vault/verify"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: code }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  const verifyVaultBiometric = useCallback(async () => false, []);

  const vaultLabels = useMemo(
    () => ({
      title: t("chat.vaultTitle"),
      subtitle: t("chat.vaultSubtitle"),
      useBiometrics: t("appLock.useBiometrics"),
      biometricsUnavailable: t("appLock.biometricsUnavailable"),
      wrongCode: t("appLock.wrongCode"),
      keypadDelete: t("appLock.keypadDelete"),
      cancel: t("common.cancel"),
    }),
    [t]
  );

  const lockChatVaultLabels = useMemo<VaultUnlockLabels>(
    () => ({
      title: t("chat.lockChatVaultTitle"),
      subtitle: t("chat.lockChatVaultSubtitle"),
      useBiometrics: t("appLock.useBiometrics"),
      biometricsUnavailable: t("appLock.biometricsUnavailable"),
      wrongCode: t("appLock.wrongCode"),
      keypadDelete: t("chat.chatVaultKeypadDelete"),
      cancel: t("common.cancel"),
    }),
    [t]
  );

  const toggleConversationLock = useCallback(
    async (locked: boolean) => {
      const id = activeConversationId;
      if (!id) return { error: "No conversation" };
      try {
        const res = await fetch(publicApiUrl(`/api/conversations/${id}/lock`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locked }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          return { error: j.error ?? "Request failed" };
        }
        patchConversationIsLocked(id, locked);
        return {};
      } catch {
        return { error: "Network error" };
      }
    },
    [activeConversationId, patchConversationIsLocked]
  );

  const setDisappearingSeconds = useCallback(
    async (seconds: number | null) => {
      const id = activeConversationId;
      if (!id) return { error: "No conversation" };
      try {
        const res = await fetch(publicApiUrl(`/api/conversations/${id}/disappearing`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seconds }),
        });
        const j = (await res.json().catch(() => ({}))) as {
          disappearingMessageSeconds?: number | null;
          error?: string;
        };
        if (!res.ok) return { error: j.error ?? "Request failed" };
        patchConversationDisappearing(id, j.disappearingMessageSeconds ?? null);
        return {};
      } catch {
        return { error: "Network error" };
      }
    },
    [activeConversationId, patchConversationDisappearing]
  );

  const toggleConversationPin = useCallback(
    async (conversationId: string, pinned: boolean) => {
      const prev = useChatStore.getState().conversations.find((c) => c.id === conversationId);
      const prevPinned = prev?.isPinnedByMe ?? false;
      const prevAt = prev?.pinnedAtMs ?? 0;
      patchConversationPin(conversationId, pinned, pinned ? Date.now() : 0);
      try {
        const res = await fetch(publicApiUrl(`/api/conversations/${conversationId}/pin`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned }),
        });
        const j = (await res.json()) as { pinnedAtMs?: number | null; error?: string };
        if (!res.ok) {
          patchConversationPin(conversationId, prevPinned, prevAt);
          return { error: j.error ?? "Request failed" };
        }
        const at = pinned ? Number(j.pinnedAtMs) || Date.now() : 0;
        patchConversationPin(conversationId, pinned, at);
        return {};
      } catch {
        patchConversationPin(conversationId, prevPinned, prevAt);
        return { error: "Network error" };
      }
    },
    [patchConversationPin]
  );

  const onStartEditMessage = useCallback(
    (m: ChatMessage) => {
      if (!activeConversationId || m.conversationId !== activeConversationId) return;
      setReplyingTo(null);
      clearAttachmentDraft();
      setEditingMessage(m);
      setDraft(activeConversationId, m.content ?? "");
    },
    [activeConversationId, setDraft, clearAttachmentDraft]
  );

  const cancelEditMessage = useCallback(() => {
    setEditingMessage(null);
    if (activeConversationId) setDraft(activeConversationId, "");
  }, [activeConversationId, setDraft]);

  const onDraftChange = useCallback(
    (text: string) => {
      setUploadNotice(null);
      if (activeConversationId) setDraft(activeConversationId, text);
    },
    [activeConversationId, setDraft]
  );

  const emitTyping = useCallback(
    (active: boolean) => {
      if (!activeConversationId) return;
      if (isConversationMessagingBlocked(activeConversationId)) return;
      const socket = getSocket();
      if (!socket.connected) return;
      if (active) {
        if (typingBurstActiveRef.current) return;
        socket.emit("typing:start", { conversationId: activeConversationId });
        typingBurstActiveRef.current = true;
      } else {
        if (!typingBurstActiveRef.current) return;
        socket.emit("typing:stop", { conversationId: activeConversationId });
        typingBurstActiveRef.current = false;
      }
    },
    [activeConversationId]
  );

  const onTypingActivity = useCallback(() => {
    const id = useChatStore.getState().activeConversationId;
    if (!id || isConversationMessagingBlocked(id)) return;
    if (!typingBurstActiveRef.current) {
      emitTyping(true);
    }
    if (typingStopTimer.current) {
      clearTimeout(typingStopTimer.current);
    }
    typingStopTimer.current = setTimeout(() => {
      emitTyping(false);
      typingStopTimer.current = null;
    }, 1800);
  }, [emitTyping]);

  const flushTyping = useCallback(() => {
    if (typingStopTimer.current) {
      clearTimeout(typingStopTimer.current);
      typingStopTimer.current = null;
    }
    emitTyping(false);
  }, [emitTyping]);

  const onSend = useCallback(() => {
    if (!activeConversationId) return;
    if (isConversationMessagingBlocked(activeConversationId)) return;
    const trimmed = draft.trim();
    const fileDraft = attachmentDraft;

    if (editingMessage) {
      if (fileDraft) return;
      const stillHasFile = !!(editingMessage.fileUrl && !editingMessage.deleted);
      if (!trimmed && !stillHasFile) return;
      flushTyping();
      playMessageSend();
      void (async () => {
        try {
          const res = await fetch(
            `/api/conversations/${activeConversationId}/messages/${encodeURIComponent(editingMessage.id)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content: trimmed }),
            }
          );
          const data = (await res.json()) as { message?: ChatMessage; error?: string };
          if (!res.ok || !data.message) return;
          applyMessageUpdate(activeConversationId, data.message);
          setEditingMessage(null);
          setDraft(activeConversationId, "");
        } catch {
          /* ignore */
        }
      })();
      return;
    }

    if (!trimmed && !fileDraft) return;

    const convRow = useChatStore.getState().conversations.find((c) => c.id === activeConversationId);
    const dSec = convRow?.disappearingMessageSeconds;
    const disappearOpt =
      typeof dSec === "number" && dSec > 0 ? { disappearTtlSec: dSec } : {};

    const replyTarget = replyingTo;
    const replyToMessageId =
      replyTarget && !replyTarget.id.startsWith("pending:") ? replyTarget.id : null;
    const optimisticReply = replyTarget
      ? {
          messageId: replyTarget.id,
          excerpt: chatPreviewLine(replyTarget).slice(0, 200),
          senderId: replyTarget.senderId,
          senderLabel:
            replyTarget.senderId === userId
              ? userLabel
              : (activePeer?.peerLabel ?? t("chat.replyPreviewMessage")),
          ...(replyTarget.fileType ? { replyMediaType: replyTarget.fileType } : {}),
        }
      : undefined;

    const clientMessageId = `pending:${crypto.randomUUID()}`;

    if (fileDraft) {
      const file = fileDraft.file;
      const maxBytes = getClientUploadMaxBytes();
      const gate = validateClientFileBeforeUpload(file, maxBytes);
      if (gate === "tooLarge") {
        setUploadNotice(t("upload.clientTooLarge", { size: formatFileSize(maxBytes) }));
        return;
      }
      if (gate === "badType") {
        setUploadNotice(t("upload.clientBadType"));
        return;
      }
      setUploadNotice(null);

      const optimisticType = classifyLocalFile(file);
      addOptimisticMessage({
        id: clientMessageId,
        conversationId: activeConversationId,
        senderId: userId,
        content: trimmed,
        createdAt: Date.now(),
        status: "sending",
        fileUrl: fileDraft.previewUrl,
        fileType: optimisticType,
        fileName: file.name,
        fileSize: file.size,
        attachmentUpload: {
          phase: "uploading",
          progress: 0,
          totalBytes: file.size,
        },
        ...(optimisticReply
          ? {
              replyTo: {
                messageId: optimisticReply.messageId,
                excerpt: optimisticReply.excerpt,
                senderId: optimisticReply.senderId,
                senderLabel: optimisticReply.senderLabel,
                ...(optimisticReply.replyMediaType
                  ? { replyMediaType: optimisticReply.replyMediaType }
                  : {}),
              },
            }
          : {}),
        ...disappearOpt,
      });
      setReplyingTo(null);
      setAttachmentDraft(null);
      flushTyping();
      playMessageSend();

      setUploadBusy(true);
      void executeAttachmentUpload(activeConversationId, clientMessageId, file, trimmed, replyToMessageId);
      return;
    }

    addOptimisticMessage({
      id: clientMessageId,
      conversationId: activeConversationId,
      senderId: userId,
      content: trimmed,
      createdAt: Date.now(),
      status: "sending",
      ...(optimisticReply
        ? {
            replyTo: {
              messageId: optimisticReply.messageId,
              excerpt: optimisticReply.excerpt,
              senderId: optimisticReply.senderId,
              senderLabel: optimisticReply.senderLabel,
              ...(optimisticReply.replyMediaType
                ? { replyMediaType: optimisticReply.replyMediaType }
                : {}),
            },
          }
        : {}),
      ...disappearOpt,
    });
    setReplyingTo(null);

    flushTyping();
    playMessageSend();

    void (async () => {
      try {
        const res = await fetch(`/api/conversations/${activeConversationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: trimmed,
            ...(replyToMessageId ? { replyToMessageId } : {}),
          }),
        });
        const data = (await res.json()) as { message?: ChatMessage; error?: string };
        if (!res.ok || !data.message) {
          markMessageFailed(clientMessageId);
          return;
        }
        confirmOptimisticMessage(clientMessageId, data.message);
        const socket = getSocket();
        if (socket.connected) {
          socket.emit("message:publish", { message: data.message });
        }
      } catch {
        markMessageFailed(clientMessageId);
      }
    })();
  }, [
    activeConversationId,
    draft,
    userId,
    replyingTo,
    editingMessage,
    attachmentDraft,
    addOptimisticMessage,
    confirmOptimisticMessage,
    markMessageFailed,
    flushTyping,
    userLabel,
    activePeer?.peerLabel,
    t,
    applyMessageUpdate,
    setDraft,
    executeAttachmentUpload,
  ]);

  const onTogglePeerBlock = useCallback(
    async (targetUserId: string, blocked: boolean): Promise<{ error?: string }> => {
      try {
        const res = await fetch("/api/me/blocks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUserId, blocked }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          return {
            error: typeof data.error === "string" && data.error.length > 0 ? data.error : "Failed",
          };
        }
        return {};
      } catch {
        return { error: "Failed" };
      }
    },
    []
  );

  useLayoutEffect(() => {
    onSendRef.current = onSend;
  }, [onSend]);

  const onAiSuggestedDraft = useCallback(
    (payload: { text: string; directive: string }) => {
      const cid = useChatStore.getState().activeConversationId;
      if (!cid) return;
      setAiSuggestion({ conversationId: cid, text: payload.text, directive: payload.directive });
    },
    []
  );

  const onDismissAiSuggestion = useCallback(() => {
    setAiSuggestion(null);
  }, []);

  const onRegenerateAiSuggestion = useCallback(async () => {
    const cid = useChatStore.getState().activeConversationId;
    const sug = aiSuggestion;
    if (!cid || !sug || sug.conversationId !== cid) return;
    const directive = sug.directive.trim();
    if (!directive) return;
    try {
      const res = await fetch(
        publicApiUrl(`/api/conversations/${encodeURIComponent(cid)}/ai-agent/suggest`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ directive, clientClock: buildAiClientClockPayload() }),
        }
      );
      const data = (await res.json()) as { text?: string };
      if (!res.ok || typeof data.text !== "string" || !data.text.trim()) return;
      setAiSuggestion({ conversationId: cid, text: data.text, directive });
    } catch {
      /* ignore */
    }
  }, [aiSuggestion]);

  const onSendAiSuggestion = useCallback(async () => {
    const cid = useChatStore.getState().activeConversationId;
    const sug = aiSuggestion;
    if (!cid || !sug || sug.conversationId !== cid || !sug.text.trim()) return;
    if (isConversationMessagingBlocked(cid)) return;
    const trimmed = sug.text.trim();
    const convRow = useChatStore.getState().conversations.find((c) => c.id === cid);
    const dSec = convRow?.disappearingMessageSeconds;
    const disappearOpt = typeof dSec === "number" && dSec > 0 ? { disappearTtlSec: dSec } : {};
    const clientMessageId = `pending:${crypto.randomUUID()}`;
    addOptimisticMessage({
      id: clientMessageId,
      conversationId: cid,
      senderId: userId,
      content: trimmed,
      createdAt: Date.now(),
      status: "sending",
      ...disappearOpt,
    });
    setAiSuggestion(null);
    flushTyping();
    playMessageSend();
    try {
      const res = await fetch(publicApiUrl(`/api/conversations/${encodeURIComponent(cid)}/messages`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });
      const data = (await res.json()) as { message?: ChatMessage; error?: string };
      if (!res.ok || !data.message) {
        markMessageFailed(clientMessageId);
        return;
      }
      confirmOptimisticMessage(clientMessageId, data.message);
      const socket = getSocket();
      if (socket.connected) {
        socket.emit("message:publish", { message: data.message });
      }
    } catch {
      markMessageFailed(clientMessageId);
    }
  }, [aiSuggestion, userId, addOptimisticMessage, confirmOptimisticMessage, markMessageFailed, flushTyping]);

  const onStartDirectChat = useCallback(
    async (email: string) => {
      const res = await fetch(publicApiUrl("/api/conversations"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantEmail: email }),
      });
      const data = (await res.json()) as {
        error?: string;
        conversation?: {
          id: string;
          peerLabel: string;
          peerUserId: string;
          peerAvatarUrl?: string | null;
          peerBio?: string;
          peerEmail?: string;
          lastMessagePreview: string;
          updatedAt: number;
          unreadCount?: number;
          peerLastReadAt?: number;
          peerLastSeenAt?: number | null;
          blockedByMe?: boolean;
          blockedByPeer?: boolean;
          isLockedByMe?: boolean;
          disappearingMessageSeconds?: number | null;
          isPinnedByMe?: boolean;
          pinnedAtMs?: number;
        };
      };
      if (!res.ok) {
        return { error: data.error ?? "Could not start chat" };
      }
      if (!data.conversation) {
        return { error: "Invalid response" };
      }
      clearAttachmentDraft();
      upsertConversation({
        ...data.conversation,
        peerAvatarUrl: data.conversation.peerAvatarUrl ?? null,
        peerBio: data.conversation.peerBio ?? "",
        peerEmail: data.conversation.peerEmail ?? "",
        peerOnline: false,
        unreadCount: data.conversation.unreadCount ?? 0,
        peerLastReadAt: data.conversation.peerLastReadAt ?? 0,
        peerLastSeenAt: data.conversation.peerLastSeenAt ?? null,
        blockedByMe: data.conversation.blockedByMe ?? false,
        blockedByPeer: data.conversation.blockedByPeer ?? false,
        isLockedByMe: data.conversation.isLockedByMe ?? false,
        disappearingMessageSeconds: data.conversation.disappearingMessageSeconds ?? null,
        isPinnedByMe: data.conversation.isPinnedByMe ?? false,
        pinnedAtMs: data.conversation.pinnedAtMs ?? 0,
      });
      setReplyingTo(null);
      setEditingMessage(null);
      setActiveConversationId(data.conversation.id);
      setMobileTab("thread");
      return {};
    },
    [upsertConversation, setActiveConversationId, clearAttachmentDraft]
  );

  return (
    <>
    {!isOnline ? (
      <div
        role="status"
        className="border-b border-amber-800/50 bg-amber-950/90 px-3 py-2 text-center text-xs text-amber-100 sm:text-sm"
      >
        {t("chat.offlineBanner")}
      </div>
    ) : null}
    <div
      className="bg-chat-thread flex h-[100dvh] w-full min-w-0 overflow-hidden"
      style={chatShellBgStyle}
    >
      <div
        className={`flex min-h-0 max-h-[42vh] w-full min-w-0 shrink-0 flex-col md:h-full md:max-h-none md:w-72 lg:w-80 xl:w-96 ${mobileTab === "thread" ? "hidden md:flex" : "flex"}`}
      >
        <ConversationSidebar
          conversations={mainConversations}
          lockedConversations={lockedConversations}
          lockedCount={lockedCount}
          hasAppLock={hasAppLock}
          lockedVaultMode={lockedVaultMode}
          onOpenLockedVault={openLockedVault}
          onCloseLockedVault={closeLockedVault}
          onLockedVaultVerified={onLockedVaultVerified}
          verifyVaultPasscode={verifyVaultPasscode}
          verifyVaultBiometric={verifyVaultBiometric}
          vaultShowBiometric={false}
          vaultLabels={vaultLabels}
          activeId={activeConversationId}
          onSelect={onSelect}
          userLabel={userLabel}
          userEmail={userAvatarEmail}
          currentUserImage={userAvatarImage}
          currentUserName={userAvatarName}
          onStartDirectChat={onStartDirectChat}
          onOpenPeerInfo={openPeerPanel}
          onToggleConversationPin={toggleConversationPin}
        />
      </div>
      <div className={`min-h-0 min-w-0 flex flex-1 flex-col ${mobileTab === "list" ? "hidden md:flex" : "flex"}`}>
        <MessageThread
          conversationId={activeConversationId}
          peerUserId={activePeer?.peerUserId ?? null}
          peerAvatarUrl={activePeer?.peerAvatarUrl ?? null}
          peerBio={activePeer?.peerBio ?? ""}
          peerEmail={activePeer?.peerEmail ?? null}
          peerLabel={activePeer?.peerLabel ?? null}
          peerOnline={activePeer?.peerOnline}
          peerLastSeenAt={activePeer?.peerLastSeenAt}
          blockedByMe={activePeer?.blockedByMe ?? false}
          blockedByPeer={activePeer?.blockedByPeer ?? false}
          onSetPeerBlocked={
            activePeer?.peerUserId
              ? (blocked) => onTogglePeerBlock(activePeer.peerUserId, blocked)
              : undefined
          }
          messages={messages}
          draft={draft}
          onDraftChange={onDraftChange}
          onTypingActivity={onTypingActivity}
          onTypingEnd={flushTyping}
          onSend={onSend}
          currentUserId={userId}
          peerTyping={peerTypingFromStore}
          peerReadAt={activePeerReadAt}
          onReply={(m) => setReplyingTo(m)}
          replyPreview={replyPreview}
          onCancelReply={() => setReplyingTo(null)}
          attachmentDraft={attachmentDraftUi}
          onClearAttachment={clearAttachmentDraft}
          onPickFiles={onPickFiles}
          onVoiceConfirm={onVoiceConfirm}
          uploadBusy={uploadBusy}
          showBack
          onBack={() => setMobileTab("list")}
          fetchOlderMessages={fetchOlderMessages}
          hasOlderMessages={hasOlderHistory}
          onEditMessage={onStartEditMessage}
          editingMeta={
            editingMessage
              ? { hasFile: !!(editingMessage.fileUrl && !editingMessage.deleted) }
              : null
          }
          onCancelEdit={cancelEditMessage}
          composerNotice={uploadNotice}
          activeUploadStrip={activeUploadStrip}
          onCancelAttachmentUpload={onCancelAttachmentUpload}
          onRetryAttachmentUpload={onRetryAttachmentUpload}
          onOpenPeerInfo={activePeer ? () => openPeerPanel(activePeer) : undefined}
          isLockedByMe={activePeer?.isLockedByMe ?? false}
          chatVaultConfigured={chatVaultConfigured}
          onOpenChatVaultSetup={() => setChatVaultSetupOpen(true)}
          onToggleConversationLock={toggleConversationLock}
          disappearingMessageSeconds={activePeer?.disappearingMessageSeconds ?? null}
          onSetDisappearingSeconds={setDisappearingSeconds}
          lockChatVerifyPasscode={chatVaultConfigured ? verifyVaultPasscode : undefined}
          lockChatVerifyBiometric={chatVaultConfigured ? verifyVaultBiometric : undefined}
          lockChatShowBiometric={false}
          lockChatVaultLabels={chatVaultConfigured ? lockChatVaultLabels : undefined}
          isPinnedByMe={activePeer?.isPinnedByMe ?? false}
          onTogglePin={
            activeConversationId
              ? (pinned) => toggleConversationPin(activeConversationId, pinned)
              : undefined
          }
          zegoCallsEnabled={zegoCallsEnabled}
          onRequestCall={handleRequestCall}
          aiSuggestion={
            activeConversationId && aiSuggestion?.conversationId === activeConversationId ? aiSuggestion : null
          }
          onSendAiSuggestion={onSendAiSuggestion}
          onDismissAiSuggestion={onDismissAiSuggestion}
          onRegenerateAiSuggestion={onRegenerateAiSuggestion}
          onAiSuggestedDraft={onAiSuggestedDraft}
        />
      </div>
    </div>
    {incomingCall && zegoCallsEnabled ? (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4 backdrop-blur-md"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="incoming-call-title"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) declineIncomingCall();
        }}
      >
        <div
          className="bg-chat-header text-chat-header-foreground w-full max-w-sm rounded-2xl border border-white/15 p-6 shadow-2xl backdrop-blur-xl"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <p id="incoming-call-title" className="text-lg font-semibold">
            {t("call.incomingTitle", { name: incomingCall.fromUserName })}
          </p>
          <p className="text-white/70 mt-1 text-sm">
            {incomingCall.callType === "video" ? t("call.incomingVideo") : t("call.incomingVoice")}
          </p>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-white/30 bg-transparent text-inherit hover:bg-white/10"
              onClick={declineIncomingCall}
            >
              {t("call.decline")}
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 text-white hover:bg-emerald-500"
              onClick={acceptIncomingCall}
            >
              {t("call.accept")}
            </Button>
          </div>
        </div>
      </div>
    ) : null}
    {activeCall && zegoCallsEnabled ? (
      <CallContainer
        key={`${activeCall.conversationId}-${activeCall.mode}`}
        conversationId={activeCall.conversationId}
        mode={activeCall.mode}
        onClose={() => setActiveCall(null)}
      />
    ) : null}
    {chatVaultSetupOpen ? (
      <ChatVaultPinSetupDialog
        open={chatVaultSetupOpen}
        onClose={() => setChatVaultSetupOpen(false)}
        onConfigured={() => setChatVaultConfigured(true)}
      />
    ) : null}
    <UserInfoPanel
      open={!!peerPanelData}
      onClose={closePeerPanel}
      name={peerPanelData?.peerLabel ?? ""}
      email={peerPanelData?.peerEmail ?? null}
      bio={peerPanelData?.peerBio ?? ""}
      image={peerPanelData?.peerAvatarUrl ?? null}
      online={!!peerPanelData?.peerOnline}
      closeLabel={t("chat.userInfoClose")}
      bioSectionLabel={t("chat.userInfoBio")}
      statusOnline={t("chat.userInfoOnline")}
      statusOffline={t("chat.userInfoOffline")}
      emptyBio={t("chat.userInfoEmptyBio")}
    />
    </>
  );
}
