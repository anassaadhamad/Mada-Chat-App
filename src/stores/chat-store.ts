import { create } from "zustand";
import { persist, type PersistStorage } from "zustand/middleware";
import type {
  ChatMessage,
  Conversation,
  MessageReactionSummary,
  PeerProfileSocketPayload,
} from "@/lib/chat-types";
import { chatPreviewLine } from "@/lib/chat-preview";
import { chatCacheStorage } from "@/lib/chat-cache-storage";
import { sanitizeMessagesForPersist } from "@/lib/chat-persist-sanitize";

type ChatState = {
  conversations: Conversation[];
  messagesByConversationId: Record<string, ChatMessage[]>;
  activeConversationId: string | null;
  draftByConversationId: Record<string, string>;
  peerTypingByConversationId: Record<string, boolean>;
  /** Other participant’s read cursor (ms), for double-check ticks on your messages. */
  peerReadAtByConversationId: Record<string, number>;
  setConversations: (list: Conversation[]) => void;
  upsertConversation: (c: Conversation) => void;
  setActiveConversationId: (id: string | null) => void;
  setDraft: (conversationId: string, text: string) => void;
  setMessagesForConversation: (conversationId: string, messages: ChatMessage[], peerReadAt?: number) => void;
  /** Merges GET /messages with live socket state so a stale HTTP response cannot erase newer rows. */
  mergeMessagesFromHistoryFetch: (conversationId: string, fetched: ChatMessage[], peerReadAt?: number) => void;
  /** Prepends older history pages (pagination) while preserving optimistic rows and order. */
  prependOlderMessages: (conversationId: string, older: ChatMessage[]) => void;
  setPeerReadAt: (conversationId: string, readAt: number) => void;
  incrementUnread: (conversationId: string) => void;
  clearUnread: (conversationId: string) => void;
  addOptimisticMessage: (message: ChatMessage) => void;
  confirmOptimisticMessage: (clientMessageId: string, serverMessage: ChatMessage) => void;
  markMessageFailed: (clientMessageId: string) => void;
  appendRemoteMessage: (message: ChatMessage) => void;
  setPeerTyping: (conversationId: string, typing: boolean) => void;
  applyPresence: (conversationId: string, onlineUserIds: string[]) => void;
  patchConversationBlockFlags: (
    conversationId: string,
    flags: { blockedByMe: boolean; blockedByPeer: boolean }
  ) => void;
  /** Replace reactions on a message (from socket, HTTP, or optimistic UI). */
  applyMessageReactions: (
    conversationId: string,
    messageId: string,
    reactions: MessageReactionSummary[]
  ) => void;
  /** Replace a message after edit or soft-delete (from HTTP or `message:updated` socket). */
  applyMessageUpdate: (conversationId: string, message: ChatMessage) => void;
  /** Merge fields into an existing message (e.g. upload progress). */
  patchMessageInConversation: (
    conversationId: string,
    messageId: string,
    patch: Partial<ChatMessage>
  ) => void;
  applyPeerProfileFromSocket: (p: PeerProfileSocketPayload) => void;
  patchConversationIsLocked: (conversationId: string, isLockedByMe: boolean) => void;
  patchConversationDisappearing: (conversationId: string, disappearingMessageSeconds: number | null) => void;
  patchConversationPin: (conversationId: string, pinned: boolean, pinnedAtMs: number) => void;
  patchMessagesDisappearSchedule: (
    conversationId: string,
    updates: { id: string; disappearExpiresAt: number; disappearStartedAt: number }[]
  ) => void;
  removeMessagesByIds: (conversationId: string, messageIds: string[]) => void;
};

type ChatCachePersistedV1 = Pick<
  ChatState,
  "conversations" | "messagesByConversationId" | "peerReadAtByConversationId" | "activeConversationId"
>;

function sortConversations(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => {
    const ap = a.isPinnedByMe ? 1 : 0;
    const bp = b.isPinnedByMe ? 1 : 0;
    if (ap !== bp) return bp - ap;
    if (ap === 1) {
      const apt = a.pinnedAtMs ?? 0;
      const bpt = b.pinnedAtMs ?? 0;
      if (apt !== bpt) return bpt - apt;
    }
    return b.updatedAt - a.updatedAt;
  });
}

function bumpConversationPreview(
  conversations: Conversation[],
  conversationId: string,
  preview: string,
  updatedAt: number
): Conversation[] {
  return sortConversations(
    conversations.map((c) =>
      c.id === conversationId ? { ...c, lastMessagePreview: preview.slice(0, 120), updatedAt } : c
    )
  );
}

function mergePeerReadAt(
  prev: Record<string, number>,
  list: Conversation[]
): Record<string, number> {
  const next = { ...prev };
  for (const c of list) {
    const v = c.peerLastReadAt ?? 0;
    if (v > (next[c.id] ?? 0)) next[c.id] = v;
  }
  return next;
}

/** One id per message — avoids duplicate bubbles when confirm maps pending + server row to the same id. */
function dedupeMessagesById(messages: ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>();
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

/** Pending row that will be replaced by this server message (socket often beats HTTP response). */
function optimisticMatchesServer(local: ChatMessage, server: ChatMessage): boolean {
  if (!local.id.startsWith("pending:")) return false;
  if (local.senderId !== server.senderId) return false;
  if (local.conversationId !== server.conversationId) return false;
  if (local.content.trim() !== server.content.trim()) return false;
  if (local.fileName && server.fileName && local.fileName !== server.fileName) return false;
  if (
    local.fileUrl?.startsWith("blob:") &&
    (server.fileUrl?.startsWith("/api/files/") || server.fileUrl?.startsWith("/uploads/"))
  ) {
    return true;
  }
  if (local.fileUrl && server.fileUrl && local.fileUrl === server.fileUrl) return true;
  if (!local.fileUrl && !server.fileUrl) return true;
  return false;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
  conversations: [],
  messagesByConversationId: {},
  activeConversationId: null,
  draftByConversationId: {},
  peerTypingByConversationId: {},
  peerReadAtByConversationId: {},

  setConversations: (list) =>
    set((s) => ({
      conversations: sortConversations(
        list.map((c) => ({
          ...c,
          peerOnline: c.peerOnline ?? false,
          blockedByMe: c.blockedByMe ?? false,
          blockedByPeer: c.blockedByPeer ?? false,
          isLockedByMe: c.isLockedByMe ?? false,
          disappearingMessageSeconds: c.disappearingMessageSeconds ?? null,
          isPinnedByMe: c.isPinnedByMe ?? false,
          pinnedAtMs: c.pinnedAtMs ?? 0,
        }))
      ),
      peerReadAtByConversationId: mergePeerReadAt(s.peerReadAtByConversationId, list),
    })),

  upsertConversation: (c) =>
    set((s) => {
      const others = s.conversations.filter((x) => x.id !== c.id);
      const pr = { ...s.peerReadAtByConversationId };
      const v = c.peerLastReadAt ?? 0;
      if (v > (pr[c.id] ?? 0)) pr[c.id] = v;
      return {
        conversations: sortConversations([
          ...others,
          {
            ...c,
            peerOnline: c.peerOnline ?? false,
            blockedByMe: c.blockedByMe ?? false,
            blockedByPeer: c.blockedByPeer ?? false,
            isLockedByMe: c.isLockedByMe ?? false,
            disappearingMessageSeconds: c.disappearingMessageSeconds ?? null,
            isPinnedByMe: c.isPinnedByMe ?? false,
            pinnedAtMs: c.pinnedAtMs ?? 0,
          },
        ]),
        peerReadAtByConversationId: pr,
      };
    }),

  setActiveConversationId: (id) => set({ activeConversationId: id }),

  setDraft: (conversationId, text) =>
    set((s) => ({
      draftByConversationId: { ...s.draftByConversationId, [conversationId]: text },
    })),

  setMessagesForConversation: (conversationId, messages, peerReadAt) =>
    set((s) => {
      const pr = { ...s.peerReadAtByConversationId };
      if (peerReadAt != null && peerReadAt > (pr[conversationId] ?? 0)) {
        pr[conversationId] = peerReadAt;
      }
      return {
        messagesByConversationId: {
          ...s.messagesByConversationId,
          [conversationId]: messages,
        },
        peerReadAtByConversationId: pr,
      };
    }),

  mergeMessagesFromHistoryFetch: (conversationId, fetched, peerReadAt) =>
    set((s) => {
      const existing = s.messagesByConversationId[conversationId] ?? [];
      const fetchedIds = new Set(fetched.map((m) => m.id));
      const extra = existing.filter((m) => {
        if (fetchedIds.has(m.id)) return false;
        if (m.id.startsWith("pending:")) {
          return !fetched.some((fmsg) => optimisticMatchesServer(m, fmsg));
        }
        return true;
      });
      const merged = dedupeMessagesById([...fetched, ...extra]);
      merged.sort((a, b) => a.createdAt - b.createdAt);
      const pr = { ...s.peerReadAtByConversationId };
      if (peerReadAt != null && peerReadAt > (pr[conversationId] ?? 0)) {
        pr[conversationId] = peerReadAt;
      }
      return {
        messagesByConversationId: {
          ...s.messagesByConversationId,
          [conversationId]: merged,
        },
        peerReadAtByConversationId: pr,
      };
    }),

  prependOlderMessages: (conversationId, older) =>
    set((s) => {
      const existing = s.messagesByConversationId[conversationId] ?? [];
      const merged = dedupeMessagesById([...older, ...existing]);
      merged.sort((a, b) => a.createdAt - b.createdAt);
      return {
        messagesByConversationId: {
          ...s.messagesByConversationId,
          [conversationId]: merged,
        },
      };
    }),

  setPeerReadAt: (conversationId, readAt) =>
    set((s) => {
      if (readAt <= (s.peerReadAtByConversationId[conversationId] ?? 0)) return s;
      return {
        peerReadAtByConversationId: { ...s.peerReadAtByConversationId, [conversationId]: readAt },
      };
    }),

  incrementUnread: (conversationId) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: (c.unreadCount ?? 0) + 1 } : c
      ),
    })),

  clearUnread: (conversationId) =>
    set((s) => ({
      conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)),
    })),

  addOptimisticMessage: (message) =>
    set((s) => {
      const prev = s.messagesByConversationId[message.conversationId] ?? [];
      const nextDraft = { ...s.draftByConversationId };
      delete nextDraft[message.conversationId];
      return {
        messagesByConversationId: {
          ...s.messagesByConversationId,
          [message.conversationId]: [...prev, message],
        },
        draftByConversationId: nextDraft,
        conversations: bumpConversationPreview(
          s.conversations,
          message.conversationId,
          chatPreviewLine(message),
          message.createdAt
        ),
      };
    }),

  confirmOptimisticMessage: (clientMessageId, serverMessage) =>
    set((s) => {
      const prev = s.messagesByConversationId[serverMessage.conversationId] ?? [];
      const old = prev.find((m) => m.id === clientMessageId);
      if (old?.fileUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(old.fileUrl);
      }
      const next = dedupeMessagesById(
        prev.map((m) =>
          m.id === clientMessageId
            ? { ...serverMessage, status: "sent" as const }
            : m.id === serverMessage.id
              ? { ...serverMessage, status: "sent" as const }
              : m
        )
      );
      return {
        messagesByConversationId: {
          ...s.messagesByConversationId,
          [serverMessage.conversationId]: next,
        },
        conversations: bumpConversationPreview(
          s.conversations,
          serverMessage.conversationId,
          chatPreviewLine(serverMessage),
          serverMessage.createdAt
        ),
      };
    }),

  markMessageFailed: (clientMessageId) =>
    set((s) => {
      const convId = Object.keys(s.messagesByConversationId).find((cid) =>
        (s.messagesByConversationId[cid] ?? []).some((m) => m.id === clientMessageId)
      );
      if (!convId) return s;
      const prev = s.messagesByConversationId[convId] ?? [];
      /** Blob previews are kept on failure so attachment retry still works; revoked on confirm. */
      return {
        messagesByConversationId: {
          ...s.messagesByConversationId,
          [convId]: prev.map((m) => (m.id === clientMessageId ? { ...m, status: "failed" as const } : m)),
        },
      };
    }),

  appendRemoteMessage: (message) =>
    set((s) => {
      const prev = s.messagesByConversationId[message.conversationId] ?? [];
      const bumped = bumpConversationPreview(
        s.conversations,
        message.conversationId,
        chatPreviewLine(message),
        message.createdAt
      );
      if (prev.some((m) => m.id === message.id)) {
        return { ...s, conversations: bumped };
      }
      const pendingIdx = prev.findIndex((m) => optimisticMatchesServer(m, message));
      if (pendingIdx !== -1) {
        const dropped = prev[pendingIdx];
        if (dropped?.fileUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(dropped.fileUrl);
        }
      }
      const withoutPending =
        pendingIdx === -1 ? prev : [...prev.slice(0, pendingIdx), ...prev.slice(pendingIdx + 1)];
      if (withoutPending.some((m) => m.id === message.id)) {
        return {
          ...s,
          messagesByConversationId: {
            ...s.messagesByConversationId,
            [message.conversationId]: dedupeMessagesById(withoutPending),
          },
          conversations: bumped,
        };
      }
      const merged = dedupeMessagesById([
        ...withoutPending,
        { ...message, status: "sent" as const },
      ]);
      return {
        messagesByConversationId: {
          ...s.messagesByConversationId,
          [message.conversationId]: merged,
        },
        conversations: bumped,
      };
    }),

  setPeerTyping: (conversationId, typing) =>
    set((s) => ({
      peerTypingByConversationId: {
        ...s.peerTypingByConversationId,
        [conversationId]: typing,
      },
    })),

  applyPresence: (conversationId, onlineUserIds) =>
    set((s) => {
      const conv = s.conversations.find((c) => c.id === conversationId);
      if (!conv) return s;
      let peerOnline = onlineUserIds.includes(conv.peerUserId);
      if (conv.blockedByMe || conv.blockedByPeer) {
        peerOnline = false;
      }
      if (conv.peerOnline === peerOnline) return s;
      return {
        conversations: s.conversations.map((c) =>
          c.id === conversationId ? { ...c, peerOnline } : c
        ),
      };
    }),

  patchConversationBlockFlags: (conversationId, flags) =>
    set((s) => ({
      conversations: s.conversations.map((c) => {
        if (c.id !== conversationId) return c;
        const next = { ...c, ...flags };
        const peerOnline =
          next.blockedByMe || next.blockedByPeer ? false : (next.peerOnline ?? false);
        return { ...next, peerOnline };
      }),
    })),

  applyMessageReactions: (conversationId, messageId, reactions) =>
    set((s) => {
      const prev = s.messagesByConversationId[conversationId] ?? [];
      const next = prev.map((m) => {
        if (m.id !== messageId) return m;
        if (!reactions.length) {
          const { reactions: _removed, ...rest } = m;
          return rest as ChatMessage;
        }
        return { ...m, reactions };
      });
      return {
        messagesByConversationId: {
          ...s.messagesByConversationId,
          [conversationId]: next,
        },
      };
    }),

  applyMessageUpdate: (conversationId, message) =>
    set((s) => {
      const prev = s.messagesByConversationId[conversationId] ?? [];
      const idx = prev.findIndex((m) => m.id === message.id);
      if (idx === -1) return s;
      const merged: ChatMessage = { ...message, status: "sent" };
      const next = [...prev.slice(0, idx), merged, ...prev.slice(idx + 1)];
      const last = prev.length > 0 ? prev[prev.length - 1] : undefined;
      let conversations = s.conversations;
      if (last?.id === message.id) {
        const bumpAt = Math.max(message.editedAt ?? 0, message.createdAt, Date.now());
        conversations = bumpConversationPreview(
          s.conversations,
          conversationId,
          chatPreviewLine(merged),
          bumpAt
        );
      }
      return {
        messagesByConversationId: {
          ...s.messagesByConversationId,
          [conversationId]: next,
        },
        conversations,
      };
    }),

  patchMessageInConversation: (conversationId, messageId, patch) =>
    set((s) => {
      const prev = s.messagesByConversationId[conversationId] ?? [];
      const next = prev.map((m) => (m.id === messageId ? { ...m, ...patch } : m));
      return {
        messagesByConversationId: {
          ...s.messagesByConversationId,
          [conversationId]: next,
        },
      };
    }),

  applyPeerProfileFromSocket: (p) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.peerUserId === p.userId
          ? {
              ...c,
              peerLabel: p.peerLabel,
              peerAvatarUrl: p.peerAvatarUrl,
              peerBio: p.peerBio,
              peerEmail: p.peerEmail,
            }
          : c
      ),
    })),

  patchConversationIsLocked: (conversationId, isLockedByMe) =>
    set((s) => ({
      conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, isLockedByMe } : c)),
    })),

  patchConversationPin: (conversationId, pinned, pinnedAtMs) =>
    set((s) => ({
      conversations: sortConversations(
        s.conversations.map((c) =>
          c.id === conversationId
            ? { ...c, isPinnedByMe: pinned, pinnedAtMs: pinned ? pinnedAtMs : 0 }
            : c
        )
      ),
    })),

  patchConversationDisappearing: (conversationId, disappearingMessageSeconds) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, disappearingMessageSeconds } : c
      ),
    })),

  patchMessagesDisappearSchedule: (conversationId, updates) =>
    set((s) => {
      if (!updates.length) return s;
      const uby = new Map(updates.map((u) => [u.id, u]));
      const prev = s.messagesByConversationId[conversationId] ?? [];
      const next = prev.map((m) => {
        const u = uby.get(m.id);
        if (!u) return m;
        return {
          ...m,
          disappearExpiresAt: u.disappearExpiresAt,
          disappearStartedAt: u.disappearStartedAt,
        };
      });
      return {
        messagesByConversationId: {
          ...s.messagesByConversationId,
          [conversationId]: next,
        },
      };
    }),

  removeMessagesByIds: (conversationId, messageIds) =>
    set((s) => {
      if (!messageIds.length) return s;
      const drop = new Set(messageIds);
      const prev = s.messagesByConversationId[conversationId] ?? [];
      const next = prev.filter((m) => !drop.has(m.id));
      return {
        messagesByConversationId: {
          ...s.messagesByConversationId,
          [conversationId]: next,
        },
      };
    }),
  }),
    {
      name: "mada-chat",
      storage: chatCacheStorage as unknown as PersistStorage<ChatCachePersistedV1>,
      skipHydration: true,
      partialize: (state) => ({
        conversations: state.conversations,
        messagesByConversationId: sanitizeMessagesForPersist(state.messagesByConversationId),
        peerReadAtByConversationId: state.peerReadAtByConversationId,
        activeConversationId: state.activeConversationId,
      }),
    }
  )
);
