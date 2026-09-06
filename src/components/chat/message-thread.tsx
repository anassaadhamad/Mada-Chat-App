"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  KeyRound,
  ListChecks,
  Lock,
  MoreHorizontal,
  Phone,
  Pin,
  Search,
  Sparkles,
  UserX,
  Video,
  X,
} from "lucide-react";
import { UserAvatar } from "@/components/user/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MessageInput, type AttachmentDraftUi } from "@/components/chat/message-input";
import { MessageList } from "@/components/chat/message-list";
import { formatLastSeen } from "@/lib/format-last-seen";
import type { ChatMessage } from "@/lib/chat-types";
import {
  type ChatSearchFilter,
  orderedSearchMatchIds,
} from "@/lib/chat-search";
import { cn } from "@/lib/utils";
import { disappearDurationShortLabel } from "@/lib/disappearing-ui-labels";
import { publicApiUrl } from "@/lib/env-public";
import { buildAiClientClockPayload } from "@/lib/ai-client-clock";
import { useI18n } from "@/components/i18n/i18n-provider";
import { useChatStore } from "@/stores/chat-store";
import { ChatVaultChangePinDialog } from "@/components/chat/chat-vault-change-pin-dialog";
import { VaultUnlockPanel, type VaultUnlockLabels } from "@/components/chat/vault-unlock-modal";
import { TwemojiText } from "@/components/chat/twemoji-text";

const AiControlCenterDialog = dynamic(
  () => import("@/components/chat/ai-control-center-dialog").then((m) => m.AiControlCenterDialog),
  { ssr: false, loading: () => null }
);

type MessageThreadProps = {
  conversationId: string | null;
  peerUserId: string | null;
  peerLabel: string | null;
  peerAvatarUrl?: string | null;
  peerBio?: string;
  peerEmail?: string | null;
  peerOnline?: boolean;
  peerLastSeenAt?: number | null;
  blockedByMe?: boolean;
  blockedByPeer?: boolean;
  onSetPeerBlocked?: (blocked: boolean) => Promise<{ error?: string }>;
  onOpenPeerInfo?: () => void;
  isLockedByMe?: boolean;
  /** User has set a Mada-only Secret Space PIN (stored on the server) for locked chats. */
  chatVaultConfigured?: boolean;
  onToggleConversationLock?: (locked: boolean) => Promise<{ error?: string }>;
  /** Called when the user tries to lock a chat but has not created a Secret Space PIN yet. */
  onOpenChatVaultSetup?: () => void;
  /** Shared disappearing TTL for this DM (seconds); null = off. */
  disappearingMessageSeconds?: number | null;
  onSetDisappearingSeconds?: (seconds: number | null) => Promise<{ error?: string }>;
  /** Verify the Mada Secret Space PIN before locking (server-backed). */
  lockChatVerifyPasscode?: (code: string) => Promise<boolean>;
  lockChatVerifyBiometric?: () => Promise<boolean>;
  lockChatShowBiometric?: boolean;
  lockChatVaultLabels?: VaultUnlockLabels;
  isPinnedByMe?: boolean;
  onTogglePin?: (pinned: boolean) => Promise<{ error?: string }>;
  messages: ChatMessage[];
  draft: string;
  onDraftChange: (text: string) => void;
  onTypingActivity?: () => void;
  onTypingEnd?: () => void;
  onSend: () => void;
  currentUserId: string;
  peerTyping: boolean;
  peerReadAt?: number;
  onReply?: (message: ChatMessage) => void;
  replyPreview?: { title: string; excerpt: string } | null;
  onCancelReply?: () => void;
  attachmentDraft?: AttachmentDraftUi | null;
  onClearAttachment?: () => void;
  onPickFiles?: (files: File[]) => void;
  onVoiceConfirm?: (file: File) => void;
  uploadBusy?: boolean;
  /** Mobile-only: back to conversation list */
  showBack?: boolean;
  onBack?: () => void;
  /** Load older messages before the current oldest (pagination). */
  fetchOlderMessages?: () => Promise<boolean>;
  /** When true, more history exists on the server before the oldest loaded row. */
  hasOlderMessages?: boolean;
  onEditMessage?: (message: ChatMessage) => void;
  editingMeta?: { hasFile: boolean } | null;
  onCancelEdit?: () => void;
  composerNotice?: string | null;
  activeUploadStrip?: {
    progress: number;
    subtitle?: string;
    onCancel?: () => void;
  } | null;
  onCancelAttachmentUpload?: (message: ChatMessage) => void;
  onRetryAttachmentUpload?: (message: ChatMessage) => void;
  /** ZegoCloud 1:1 calls (requires server env). */
  zegoCallsEnabled?: boolean;
  onRequestCall?: (kind: "voice" | "video") => void;
  /** AI suggested reply (Suggested mode); not persisted until user sends. */
  aiSuggestion?: { text: string; directive: string } | null;
  onSendAiSuggestion?: () => void;
  onDismissAiSuggestion?: () => void;
  onRegenerateAiSuggestion?: () => void;
  onAiSuggestedDraft?: (payload: { text: string; directive: string }) => void;
};

const SEARCH_FILTERS: ChatSearchFilter[] = ["text", "media", "links", "voice"];

export function MessageThread({
  conversationId,
  peerUserId,
  peerLabel,
  peerAvatarUrl = null,
  peerBio = "",
  peerEmail = null,
  peerOnline,
  peerLastSeenAt,
  blockedByMe = false,
  blockedByPeer = false,
  onSetPeerBlocked,
  onOpenPeerInfo,
  isLockedByMe = false,
  chatVaultConfigured = false,
  onToggleConversationLock,
  onOpenChatVaultSetup,
  disappearingMessageSeconds = null,
  onSetDisappearingSeconds,
  lockChatVerifyPasscode,
  lockChatVerifyBiometric,
  lockChatShowBiometric = false,
  lockChatVaultLabels,
  isPinnedByMe = false,
  onTogglePin,
  messages,
  draft,
  onDraftChange,
  onTypingActivity,
  onTypingEnd,
  onSend,
  currentUserId,
  peerTyping,
  peerReadAt,
  onReply,
  replyPreview,
  onCancelReply,
  attachmentDraft,
  onClearAttachment,
  onPickFiles,
  onVoiceConfirm,
  uploadBusy,
  showBack,
  onBack,
  fetchOlderMessages,
  hasOlderMessages = false,
  onEditMessage,
  editingMeta,
  onCancelEdit,
  composerNotice,
  activeUploadStrip,
  onCancelAttachmentUpload,
  onRetryAttachmentUpload,
  zegoCallsEnabled = false,
  onRequestCall,
  aiSuggestion = null,
  onSendAiSuggestion,
  onDismissAiSuggestion,
  onRegenerateAiSuggestion,
  onAiSuggestedDraft,
}: MessageThreadProps) {
  const { t, locale } = useI18n();
  const [searchOpen, setSearchOpen] = useState(false);
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [aiCenterOpen, setAiCenterOpen] = useState(false);
  const [convLockBusy, setConvLockBusy] = useState(false);
  const [convMenuOpen, setConvMenuOpen] = useState(false);
  const [convMenuPanel, setConvMenuPanel] = useState<"main" | "disappear">("main");
  const [lockVaultOpen, setLockVaultOpen] = useState(false);
  const [changePinOpen, setChangePinOpen] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [disappearBusy, setDisappearBusy] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchFilter, setSearchFilter] = useState<ChatSearchFilter>("text");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [catchUpMode, setCatchUpMode] = useState(false);
  const [catchUpSelectedIds, setCatchUpSelectedIds] = useState<Set<string>>(() => new Set());
  const [catchUpSummaryOpen, setCatchUpSummaryOpen] = useState(false);
  const [catchUpSummaryText, setCatchUpSummaryText] = useState("");
  const [catchUpBusy, setCatchUpBusy] = useState(false);
  const [catchUpError, setCatchUpError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setSearchOpen(false);
    setSearchInput("");
    setDebouncedSearch("");
    setSearchFilter("text");
    setActiveMatchIndex(0);
    setBlockConfirmOpen(false);
    setConvMenuOpen(false);
    setConvMenuPanel("main");
    setLockVaultOpen(false);
    setChangePinOpen(false);
    setPinBusy(false);
    setCatchUpMode(false);
    setCatchUpSelectedIds(new Set());
    setCatchUpSummaryOpen(false);
    setCatchUpSummaryText("");
    setCatchUpBusy(false);
    setCatchUpError(null);
  }, [conversationId]);

  useEffect(() => {
    setActiveMatchIndex(0);
  }, [debouncedSearch, searchFilter]);

  useEffect(() => {
    if (!searchOpen) {
      setSearchInput("");
      setDebouncedSearch("");
      setSearchFilter("text");
      setActiveMatchIndex(0);
    }
  }, [searchOpen]);

  const normalizedQuery = debouncedSearch.trim().toLowerCase();

  const matchIds = useMemo(
    () => orderedSearchMatchIds(messages, searchFilter, normalizedQuery),
    [messages, searchFilter, normalizedQuery]
  );

  useEffect(() => {
    setActiveMatchIndex((i) => {
      if (matchIds.length === 0) return 0;
      return Math.min(i, matchIds.length - 1);
    });
  }, [matchIds.length]);

  const activeMatchId = matchIds.length > 0 ? (matchIds[activeMatchIndex] ?? matchIds[0]) : null;

  const matchIdsRef = useRef(matchIds);
  matchIdsRef.current = matchIds;

  useEffect(() => {
    if (!activeMatchId || !fetchOlderMessages || !conversationId) return;
    if (messages.some((m) => m.id === activeMatchId)) return;
    let cancelled = false;
    void (async () => {
      let guard = 0;
      while (!cancelled && guard < 48) {
        const latest = useChatStore.getState().messagesByConversationId[conversationId] ?? [];
        if (latest.some((m) => m.id === activeMatchId)) return;
        const more = await fetchOlderMessages();
        if (!more) return;
        guard++;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeMatchId, conversationId, messages, fetchOlderMessages]);

  const goPrevMatch = useCallback(() => {
    setActiveMatchIndex((i) => {
      const list = matchIdsRef.current;
      if (list.length === 0) return 0;
      return (i - 1 + list.length) % list.length;
    });
  }, []);

  const goNextMatch = useCallback(() => {
    setActiveMatchIndex((i) => {
      const list = matchIdsRef.current;
      if (list.length === 0) return 0;
      return (i + 1) % list.length;
    });
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
  }, []);

  const exitCatchUpMode = useCallback(() => {
    setCatchUpMode(false);
    setCatchUpSelectedIds(new Set());
    setCatchUpSummaryOpen(false);
    setCatchUpSummaryText("");
    setCatchUpBusy(false);
    setCatchUpError(null);
  }, []);

  const toggleCatchUpSelection = useCallback((messageId: string) => {
    setCatchUpSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }, []);

  const runCatchUpSummarize = useCallback(async () => {
    if (!conversationId || catchUpSelectedIds.size === 0) return;
    const orderedIds = messages.filter((m) => catchUpSelectedIds.has(m.id)).map((m) => m.id);
    if (orderedIds.length === 0) return;
    setCatchUpBusy(true);
    setCatchUpError(null);
    setCatchUpSummaryText("");
    try {
      const res = await fetch(publicApiUrl(`/api/conversations/${conversationId}/ai-agent/summarize`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messageIds: orderedIds,
          clientClock: buildAiClientClockPayload(),
        }),
      });
      const data = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
      if (!res.ok) {
        setCatchUpError(data?.error ?? t("chat.catchUpSummarizeError"));
        return;
      }
      const text = typeof data?.text === "string" ? data.text.trim() : "";
      if (!text) {
        setCatchUpError(t("chat.catchUpSummarizeEmpty"));
        return;
      }
      setCatchUpSummaryText(text);
      setCatchUpSummaryOpen(true);
    } catch {
      setCatchUpError(t("chat.catchUpSummarizeError"));
    } finally {
      setCatchUpBusy(false);
    }
  }, [conversationId, catchUpSelectedIds, messages, t]);

  const insertCatchUpSummaryIntoDraft = useCallback(() => {
    const text = catchUpSummaryText.trim();
    if (!text) return;
    const base = draft.trim();
    onDraftChange(base ? `${base}\n\n${text}` : text);
    setCatchUpSummaryOpen(false);
    exitCatchUpMode();
  }, [catchUpSummaryText, draft, exitCatchUpMode, onDraftChange]);

  const showSearchEmpty =
    searchOpen &&
    matchIds.length === 0 &&
    (normalizedQuery.length > 0 || searchFilter !== "text");

  const showTypeHint =
    searchOpen && searchFilter === "text" && !normalizedQuery && matchIds.length === 0;

  const highlightQuery = normalizedQuery.length > 0 ? debouncedSearch.trim() : undefined;

  const messagingBlocked = blockedByMe || blockedByPeer;
  const hasLockMenuItems = Boolean(onToggleConversationLock);
  const hasBlockMenuItems = Boolean(peerUserId && onSetPeerBlocked && (blockedByMe || !blockedByPeer));
  const hasSearchInMenu = !messagingBlocked;
  const hasDisappearInMenu = Boolean(onSetDisappearingSeconds && !messagingBlocked);
  const hasPinInMenu = Boolean(onTogglePin);
  const hasChangePinInMenu =
    Boolean(isLockedByMe && chatVaultConfigured && lockChatVerifyPasscode);
  const hasNonLockTopMenuRows = hasSearchInMenu || hasDisappearInMenu || hasPinInMenu;
  const showConvOverflowMenu =
    hasSearchInMenu ||
    hasDisappearInMenu ||
    hasPinInMenu ||
    hasLockMenuItems ||
    hasBlockMenuItems ||
    hasChangePinInMenu;
  const effectivePeerOnline = messagingBlocked ? false : !!peerOnline;
  const peerReadAtForList = messagingBlocked ? undefined : peerReadAt;
  const composerPlaceholder = messagingBlocked
    ? blockedByMe
      ? t("chat.composerBlockedByYou")
      : t("chat.composerBlockedByPeer")
    : undefined;

  const runUnblock = useCallback(async () => {
    if (!onSetPeerBlocked) return;
    setConvMenuOpen(false);
    setConvMenuPanel("main");
    setBlockBusy(true);
    try {
      await onSetPeerBlocked(false);
    } finally {
      setBlockBusy(false);
    }
  }, [onSetPeerBlocked]);

  const runConfirmBlock = useCallback(async () => {
    if (!onSetPeerBlocked) return;
    setBlockBusy(true);
    try {
      const r = await onSetPeerBlocked(true);
      if (!r.error) setBlockConfirmOpen(false);
    } finally {
      setBlockBusy(false);
    }
  }, [onSetPeerBlocked]);

  const runConvLockToggle = useCallback(
    async (locked: boolean) => {
      if (!onToggleConversationLock) return;
      setConvLockBusy(true);
      try {
        await onToggleConversationLock(locked);
        setConvMenuOpen(false);
        setConvMenuPanel("main");
      } finally {
        setConvLockBusy(false);
      }
    },
    [onToggleConversationLock]
  );

  const pickDisappearingSeconds = useCallback(
    async (seconds: number | null) => {
      if (!onSetDisappearingSeconds) return;
      setDisappearBusy(true);
      try {
        await onSetDisappearingSeconds(seconds);
        setConvMenuOpen(false);
        setConvMenuPanel("main");
      } finally {
        setDisappearBusy(false);
      }
    },
    [onSetDisappearingSeconds]
  );

  const openLockChatVault = useCallback(() => {
    setConvMenuOpen(false);
    setConvMenuPanel("main");
    if (chatVaultConfigured && lockChatVerifyPasscode && lockChatVaultLabels) {
      setLockVaultOpen(true);
      return;
    }
    if (!chatVaultConfigured) {
      onOpenChatVaultSetup?.();
      return;
    }
    void runConvLockToggle(true);
  }, [
    chatVaultConfigured,
    lockChatVerifyPasscode,
    lockChatVaultLabels,
    onOpenChatVaultSetup,
    runConvLockToggle,
  ]);

  const runPinToggle = useCallback(async () => {
    if (!onTogglePin) return;
    setPinBusy(true);
    try {
      await onTogglePin(!isPinnedByMe);
      setConvMenuOpen(false);
      setConvMenuPanel("main");
    } finally {
      setPinBusy(false);
    }
  }, [onTogglePin, isPinnedByMe]);

  const showLockSection = hasLockMenuItems;
  const showBlockSection = hasBlockMenuItems;

  if (!conversationId || !peerLabel) {
    return (
      <div className="bg-background text-muted-foreground flex min-w-0 flex-1 flex-col items-center justify-center gap-2 overflow-x-hidden p-8 text-center text-sm">
        <p>{t("chat.selectConversation")}</p>
        <p className="max-w-xs text-xs">{t("chat.selectConversationHint")}</p>
      </div>
    );
  }

  return (
    <>
    <div className="bg-chat-thread flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
      <header className="border-chat-header-border bg-chat-header text-chat-header-foreground flex min-w-0 shrink-0 flex-col gap-2 border-b px-2 py-2.5 shadow-sm md:px-4 xl:px-6">
        <div className="flex min-w-0 items-center gap-2">
          {showBack ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-chat-header-foreground hover:bg-white/10 md:hidden"
              onClick={onBack}
              aria-label={t("chat.backAria")}
            >
              <ChevronLeft className="size-5 rtl:rotate-180" />
            </Button>
          ) : null}
          {!searchOpen ? (
            onOpenPeerInfo ? (
            <button
              type="button"
              onClick={onOpenPeerInfo}
              className="hover:bg-white/8 flex min-w-0 flex-1 items-start gap-2 rounded-lg py-0.5 pe-1 text-start transition-colors"
            >
              <div className="relative shrink-0">
                <UserAvatar
                  name={peerLabel ?? ""}
                  email={peerEmail}
                  image={peerAvatarUrl}
                  size={36}
                  variant="header"
                  className="ring-2 ring-white/20"
                />
                {effectivePeerOnline ? (
                  <span
                    className="absolute end-0 bottom-0 size-2.5 rounded-full bg-emerald-400 ring-2 ring-[var(--chat-header)]"
                    title={t("common.online")}
                    aria-label={t("common.online")}
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold">{peerLabel}</h2>
                {peerBio.trim() ? (
                  <p className="text-white/65 line-clamp-2 text-[11px] leading-snug">{peerBio}</p>
                ) : null}
                <p className="min-h-[1rem] text-xs text-white/80 transition-opacity">
                  {peerTyping && !messagingBlocked ? (
                    <span className="italic">{t("chat.typing")}</span>
                  ) : (
                    formatLastSeen(peerLastSeenAt, effectivePeerOnline, locale, t) || "\u00a0"
                  )}
                </p>
              </div>
            </button>
          ) : (
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <div className="relative shrink-0">
                <UserAvatar
                  name={peerLabel ?? ""}
                  email={peerEmail}
                  image={peerAvatarUrl}
                  size={36}
                  variant="header"
                  className="ring-2 ring-white/20"
                />
                {effectivePeerOnline ? (
                  <span
                    className="absolute end-0 bottom-0 size-2.5 rounded-full bg-emerald-400 ring-2 ring-[var(--chat-header)]"
                    title={t("common.online")}
                    aria-label={t("common.online")}
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold">{peerLabel}</h2>
                {peerBio.trim() ? (
                  <p className="text-white/65 line-clamp-2 text-[11px] leading-snug">{peerBio}</p>
                ) : null}
                <p className="min-h-[1rem] text-xs text-white/80 transition-opacity">
                  {peerTyping && !messagingBlocked ? (
                    <span className="italic">{t("chat.typing")}</span>
                  ) : (
                    formatLastSeen(peerLastSeenAt, effectivePeerOnline, locale, t) || "\u00a0"
                  )}
                </p>
              </div>
            </div>
          )) : (
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t("chatSearch.inputPlaceholder")}
                className="border-white/25 bg-white/10 text-chat-header-foreground placeholder:text-white/50 h-9 flex-1 text-sm"
                aria-label={t("chatSearch.inputAria")}
                autoFocus
              />
              <span className="text-white/80 hidden shrink-0 text-[11px] tabular-nums sm:inline">
                {matchIds.length > 0 ? `${activeMatchIndex + 1}/${matchIds.length}` : ""}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-chat-header-foreground hover:bg-white/10 size-9 shrink-0"
                aria-label={t("chatSearch.prevMatchAria")}
                disabled={matchIds.length === 0}
                onClick={goPrevMatch}
              >
                <ChevronUp className="size-5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-chat-header-foreground hover:bg-white/10 size-9 shrink-0"
                aria-label={t("chatSearch.nextMatchAria")}
                disabled={matchIds.length === 0}
                onClick={goNextMatch}
              >
                <ChevronDown className="size-5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-chat-header-foreground hover:bg-white/10 size-9 shrink-0"
                aria-label={t("chatSearch.closeAria")}
                onClick={closeSearch}
              >
                <X className="size-5" />
              </Button>
            </div>
          )}
          {!searchOpen ? (
            <div className="ms-auto flex shrink-0 items-center gap-0.5">
              {zegoCallsEnabled && !messagingBlocked && onRequestCall ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-chat-header-foreground hover:bg-white/10 size-9 shrink-0"
                    aria-label={t("call.voiceAria")}
                    onClick={() => onRequestCall("voice")}
                  >
                    <Phone className="size-5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-chat-header-foreground hover:bg-white/10 size-9 shrink-0"
                    aria-label={t("call.videoAria")}
                    onClick={() => onRequestCall("video")}
                  >
                    <Video className="size-5" />
                  </Button>
                </>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-chat-header-foreground hover:bg-white/10 size-9 shrink-0"
                aria-label={t("aiAgent.openAria")}
                title={t("aiAgent.openAria")}
                disabled={messagingBlocked}
                onClick={() => setAiCenterOpen(true)}
              >
                <Sparkles className="size-5" />
              </Button>
              {showConvOverflowMenu ? (
                <div className="relative">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-chat-header-foreground hover:bg-white/10 size-9 shrink-0"
                    aria-label={t("chat.convSettingsAria")}
                    aria-haspopup="menu"
                    aria-expanded={convMenuOpen}
                    disabled={disappearBusy || convLockBusy || blockBusy || pinBusy}
                    onClick={() => {
                      setConvMenuOpen((open) => {
                        const next = !open;
                        if (next) setConvMenuPanel("main");
                        return next;
                      });
                    }}
                  >
                    <MoreHorizontal className="size-5" />
                  </Button>
                  {convMenuOpen ? (
                    <>
                      <button
                        type="button"
                        className="fixed inset-0 z-[19] cursor-default bg-transparent"
                        aria-label={t("common.cancel")}
                        onClick={() => {
                          setConvMenuOpen(false);
                          setConvMenuPanel("main");
                        }}
                      />
                      <div
                        role="menu"
                        className={cn(
                          "border-chat-header-border bg-chat-header absolute top-full end-0 z-20 mt-1 rounded-lg border py-1 shadow-lg",
                          convMenuPanel === "disappear" ? "min-w-[11rem]" : "min-w-[14rem]"
                        )}
                      >
                        {convMenuPanel === "main" ? (
                          <>
                            {hasSearchInMenu ? (
                              <button
                                type="button"
                                role="menuitem"
                                className="hover:bg-white/10 flex w-full items-center gap-2 px-3 py-2 text-start text-sm"
                                onClick={() => {
                                  setConvMenuOpen(false);
                                  setConvMenuPanel("main");
                                  setSearchOpen(true);
                                }}
                              >
                                <Search className="size-4 shrink-0 opacity-90" />
                                {t("chat.menuSearchMessages")}
                              </button>
                            ) : null}
                            {hasSearchInMenu ? (
                              <button
                                type="button"
                                role="menuitem"
                                className="hover:bg-white/10 flex w-full items-center gap-2 px-3 py-2 text-start text-sm"
                                onClick={() => {
                                  setConvMenuOpen(false);
                                  setConvMenuPanel("main");
                                  setSearchOpen(false);
                                  setCatchUpMode(true);
                                  setCatchUpSelectedIds(new Set());
                                  setCatchUpError(null);
                                }}
                              >
                                <ListChecks className="size-4 shrink-0 opacity-90" />
                                {t("chat.menuCatchUpMode")}
                              </button>
                            ) : null}
                            {hasPinInMenu ? (
                              <button
                                type="button"
                                role="menuitem"
                                className="hover:bg-white/10 flex w-full items-center gap-2 px-3 py-2 text-start text-sm"
                                disabled={pinBusy}
                                onClick={() => void runPinToggle()}
                              >
                                <Pin
                                  className={cn(
                                    "size-4 shrink-0 opacity-90",
                                    isPinnedByMe ? "text-amber-200" : ""
                                  )}
                                />
                                {isPinnedByMe ? t("chat.unpinChat") : t("chat.pinChat")}
                              </button>
                            ) : null}
                            {hasDisappearInMenu ? (
                              <button
                                type="button"
                                role="menuitem"
                                className="hover:bg-white/10 flex w-full items-center gap-2 px-3 py-2 text-start text-sm"
                                onClick={() => setConvMenuPanel("disappear")}
                              >
                                <Clock
                                  className={cn(
                                    "size-4 shrink-0 opacity-90",
                                    disappearingMessageSeconds != null ? "text-amber-200" : ""
                                  )}
                                />
                                <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
                                  <span>{t("chat.menuDisappearingMessages")}</span>
                                  {disappearingMessageSeconds != null ? (
                                    <span className="text-white/65 text-[11px] font-normal">
                                      {t("chat.disappearingStatusLine", {
                                        label: disappearDurationShortLabel(disappearingMessageSeconds, t),
                                      })}
                                    </span>
                                  ) : null}
                                </span>
                                <ChevronRight className="size-4 shrink-0 opacity-70 rtl:rotate-180" />
                              </button>
                            ) : null}
                            {hasNonLockTopMenuRows && (showLockSection || showBlockSection) ? (
                              <div
                                className="border-chat-header-border mx-2 my-0.5 border-t opacity-60"
                                role="separator"
                              />
                            ) : null}
                            {showLockSection ? (
                              isLockedByMe ? (
                                <>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="hover:bg-white/10 flex w-full items-center gap-2 px-3 py-2 text-start text-sm"
                                    disabled={convLockBusy}
                                    onClick={() => void runConvLockToggle(false)}
                                  >
                                    <Lock className="size-4 shrink-0 opacity-90" />
                                    {t("chat.unlockChat")}
                                  </button>
                                  {hasChangePinInMenu ? (
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="hover:bg-white/10 flex w-full items-center gap-2 px-3 py-2 text-start text-sm"
                                      onClick={() => {
                                        setConvMenuOpen(false);
                                        setConvMenuPanel("main");
                                        setChangePinOpen(true);
                                      }}
                                    >
                                      <KeyRound className="size-4 shrink-0 opacity-90" />
                                      {t("chat.changePinMenu")}
                                    </button>
                                  ) : null}
                                </>
                              ) : (
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="hover:bg-white/10 flex w-full items-center gap-2 px-3 py-2 text-start text-sm"
                                  disabled={convLockBusy}
                                  onClick={() => openLockChatVault()}
                                >
                                  <Lock className="size-4 shrink-0 opacity-90" />
                                  {t("chat.lockChat")}
                                </button>
                              )
                            ) : null}
                            {showLockSection && showBlockSection ? (
                              <div
                                className="border-chat-header-border mx-2 my-0.5 border-t opacity-60"
                                role="separator"
                              />
                            ) : null}
                            {showBlockSection ? (
                              blockedByMe ? (
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="hover:bg-white/10 flex w-full items-center gap-2 px-3 py-2 text-start text-sm"
                                  disabled={blockBusy}
                                  onClick={() => void runUnblock()}
                                >
                                  <UserX className="size-4 shrink-0 opacity-90" />
                                  {t("chat.unblockUser")}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="hover:bg-white/10 flex w-full items-center gap-2 px-3 py-2 text-start text-sm text-red-200 hover:bg-red-500/15"
                                  disabled={blockBusy}
                                  onClick={() => {
                                    setConvMenuOpen(false);
                                    setConvMenuPanel("main");
                                    setBlockConfirmOpen(true);
                                  }}
                                >
                                  <UserX className="size-4 shrink-0 text-red-200" />
                                  {t("chat.blockUser")}
                                </button>
                              )
                            ) : null}
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              role="menuitem"
                              className="hover:bg-white/10 flex w-full items-center gap-2 px-3 py-2 text-start text-sm"
                              onClick={() => setConvMenuPanel("main")}
                            >
                              <ChevronLeft className="size-4 shrink-0 opacity-90 rtl:rotate-180" />
                              {t("common.back")}
                            </button>
                            <div
                              className="border-chat-header-border mx-2 my-0.5 border-t opacity-60"
                              role="separator"
                            />
                            {(
                              [
                                [null, t("chat.disappearOff")] as const,
                                [5, t("chat.disappear5s")] as const,
                                [60, t("chat.disappear1m")] as const,
                                [3600, t("chat.disappear1h")] as const,
                                [86400, t("chat.disappear1d")] as const,
                              ] as const
                            ).map(([sec, label]) => {
                              const selected =
                                sec === null
                                  ? disappearingMessageSeconds == null
                                  : disappearingMessageSeconds === sec;
                              return (
                                <button
                                  key={String(sec ?? "off")}
                                  type="button"
                                  role="menuitem"
                                  className={cn(
                                    "hover:bg-white/10 flex w-full items-center gap-2 px-3 py-2 text-start text-sm",
                                    selected ? "bg-white/10 font-medium" : ""
                                  )}
                                  disabled={disappearBusy}
                                  onClick={() => void pickDisappearingSeconds(sec)}
                                >
                                  <Clock className="size-4 shrink-0 opacity-70" />
                                  {label}
                                </button>
                              );
                            })}
                          </>
                        )}
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {searchOpen ? (
          <div className="flex flex-col gap-2 ps-0 md:ps-11">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("chatSearch.filtersAria")}>
              {SEARCH_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setSearchFilter(f)}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
                    searchFilter === f
                      ? "bg-white/25 text-white"
                      : "bg-white/10 text-white/85 hover:bg-white/15"
                  )}
                >
                  {t(`chatSearch.filter.${f}`)}
                </button>
              ))}
            </div>
            {showTypeHint ? (
              <p className="text-white/70 text-center text-xs">{t("chatSearch.typeHint")}</p>
            ) : null}
            {showSearchEmpty ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-6 text-center">
                <div
                  className="text-white/35 flex size-14 items-center justify-center rounded-full border border-dashed border-white/25"
                  aria-hidden
                >
                  <Search className="size-7" />
                </div>
                <p className="text-white/90 text-sm font-medium">{t("chatSearch.noResultsTitle")}</p>
                <p className="text-white/65 max-w-xs text-xs">{t("chatSearch.noResultsBody")}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </header>
      {catchUpMode ? (
        <div
          role="status"
          className="border-chat-header-border bg-muted/50 text-foreground shrink-0 border-b px-3 py-2 text-sm sm:px-4"
        >
          <p className="text-center font-medium">{t("chat.catchUpBanner")}</p>
        </div>
      ) : null}
      {changePinOpen && lockChatVerifyPasscode ? (
        <ChatVaultChangePinDialog
          open={changePinOpen}
          conversationId={conversationId}
          verifyPasscode={lockChatVerifyPasscode}
          onClose={() => setChangePinOpen(false)}
        />
      ) : null}
      {lockVaultOpen && lockChatVaultLabels && lockChatVerifyPasscode ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={lockChatVaultLabels.title}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setLockVaultOpen(false);
          }}
        >
          <div
            className="bg-card max-h-[90vh] w-full max-w-sm overflow-auto rounded-xl border shadow-lg"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <VaultUnlockPanel
              open={lockVaultOpen}
              labels={lockChatVaultLabels}
              showBiometric={!!lockChatShowBiometric}
              verifyPasscode={lockChatVerifyPasscode}
              verifyBiometric={lockChatVerifyBiometric ?? (async () => false)}
              onVerified={() => {
                void (async () => {
                  try {
                    await runConvLockToggle(true);
                  } finally {
                    setLockVaultOpen(false);
                  }
                })();
              }}
              onCancel={() => setLockVaultOpen(false)}
            />
          </div>
        </div>
      ) : null}
      {blockConfirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="block-user-title"
          aria-describedby="block-user-desc"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !blockBusy) setBlockConfirmOpen(false);
          }}
        >
          <div
            className="bg-card w-full max-w-sm rounded-xl border p-4 shadow-lg"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id="block-user-title" className="text-base font-semibold">
              {t("chat.blockUserConfirmSimpleTitle")}
            </h2>
            <p id="block-user-desc" className="text-muted-foreground mt-2 text-sm">
              {t("chat.blockUserConfirmSimpleBody")}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={blockBusy}
                onClick={() => setBlockConfirmOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={blockBusy}
                onClick={() => void runConfirmBlock()}
              >
                {t("chat.blockUser")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <MessageList
        conversationId={conversationId}
        messages={messages}
        currentUserId={currentUserId}
        peerLabel={peerLabel}
        peerReadAt={peerReadAtForList}
        interactionLocked={messagingBlocked}
        onReply={messagingBlocked ? undefined : onReply}
        stickToBottomOnNewMessages={!searchOpen && !catchUpMode}
        highlightQuery={highlightQuery}
        activeSearchMessageId={activeMatchId}
        fetchOlderMessages={fetchOlderMessages}
        hasOlderMessages={hasOlderMessages}
        onEditMessage={messagingBlocked ? undefined : onEditMessage}
        onCancelAttachmentUpload={onCancelAttachmentUpload}
        onRetryAttachmentUpload={onRetryAttachmentUpload}
        catchUpMode={!messagingBlocked && catchUpMode}
        catchUpSelectedIds={catchUpSelectedIds}
        onCatchUpToggle={!messagingBlocked && catchUpMode ? toggleCatchUpSelection : undefined}
      />
      {catchUpMode && !messagingBlocked ? (
        <div
          role="toolbar"
          aria-label={t("chat.catchUpToolbarAria")}
          className="border-chat-header-border bg-muted/45 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-3 py-2 sm:px-4"
        >
          <Button type="button" variant="outline" size="sm" onClick={exitCatchUpMode} disabled={catchUpBusy}>
            {t("common.cancel")}
          </Button>
          <p className="text-muted-foreground min-w-0 flex-1 text-center text-xs sm:text-sm">
            {t("chat.catchUpSelectedCount", { count: catchUpSelectedIds.size })}
          </p>
          <Button
            type="button"
            size="sm"
            disabled={catchUpSelectedIds.size === 0 || catchUpBusy}
            onClick={() => void runCatchUpSummarize()}
          >
            {catchUpBusy ? t("common.loading") : t("chat.catchUpSummarize")}
          </Button>
        </div>
      ) : null}
      {catchUpError && catchUpMode && !messagingBlocked ? (
        <p className="text-destructive bg-destructive/10 shrink-0 px-3 py-1.5 text-center text-xs sm:px-4">
          {catchUpError}
        </p>
      ) : null}
      {aiSuggestion && !messagingBlocked ? (
        <div
          role="region"
          aria-label={t("aiAgent.suggestionRegionAria")}
          className="border-chat-header-border bg-muted/40 shrink-0 border-t px-3 py-3 sm:px-4"
        >
          <p className="text-muted-foreground text-xs font-medium">{t("aiAgent.suggestionTitle")}</p>
          <TwemojiText
            text={aiSuggestion.text}
            className="mt-1 block max-h-32 overflow-y-auto whitespace-pre-wrap text-sm"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => onSendAiSuggestion?.()} disabled={!onSendAiSuggestion}>
              {t("aiAgent.suggestionSend")}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => onRegenerateAiSuggestion?.()} disabled={!onRegenerateAiSuggestion}>
              {t("aiAgent.suggestionRegenerate")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => onDismissAiSuggestion?.()} disabled={!onDismissAiSuggestion}>
              {t("aiAgent.suggestionDismiss")}
            </Button>
          </div>
        </div>
      ) : null}
      {catchUpSummaryOpen ? (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="catch-up-summary-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !catchUpBusy) setCatchUpSummaryOpen(false);
          }}
        >
          <div
            className="bg-card max-h-[90vh] w-full max-w-lg overflow-hidden rounded-xl border shadow-lg"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="border-b px-4 py-3">
              <h2 id="catch-up-summary-title" className="text-base font-semibold">
                {t("chat.catchUpSummaryTitle")}
              </h2>
            </div>
            <div className="max-h-[min(60vh,24rem)] overflow-y-auto p-4">
              <Textarea
                readOnly
                value={catchUpSummaryText}
                className="min-h-[12rem] resize-none text-sm"
                aria-label={t("chat.catchUpSummaryTitle")}
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t px-4 py-3">
              <Button type="button" variant="outline" onClick={() => setCatchUpSummaryOpen(false)}>
                {t("chat.catchUpSummaryClose")}
              </Button>
              <Button type="button" onClick={insertCatchUpSummaryIntoDraft}>
                {t("chat.catchUpSummaryInsertDraft")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <MessageInput
        value={draft}
        onChange={onDraftChange}
        onTypingActivity={onTypingActivity}
        onTypingEnd={onTypingEnd}
        onSend={onSend}
        disabled={messagingBlocked}
        placeholder={composerPlaceholder}
        replyPreview={replyPreview}
        onCancelReply={onCancelReply}
        attachmentDraft={attachmentDraft}
        onClearAttachment={onClearAttachment}
        onPickFiles={onPickFiles}
        onVoiceConfirm={onVoiceConfirm}
        uploadBusy={uploadBusy}
        editingMeta={editingMeta}
        onCancelEdit={onCancelEdit}
        composerNotice={composerNotice}
        activeUploadStrip={activeUploadStrip}
      />
    </div>
    <AiControlCenterDialog
      open={aiCenterOpen}
      onOpenChange={setAiCenterOpen}
      conversationId={conversationId}
      sendDisabled={messagingBlocked}
      onSuggestedDraft={onAiSuggestedDraft}
    />
    </>
  );
}
