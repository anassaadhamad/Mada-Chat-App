"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, FolderLock, Lock, MessageSquare, Pin, Settings, UserPlus } from "lucide-react";
import { UserAvatar } from "@/components/user/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { TwemojiText } from "@/components/chat/twemoji-text";
import { VaultUnlockPanel, type VaultUnlockLabels } from "@/components/chat/vault-unlock-modal";
import type { Conversation } from "@/lib/chat-types";
import { disappearDurationShortLabel } from "@/lib/disappearing-ui-labels";
import { parseDisappearingTimerPreview } from "@/lib/system-message-preview";
import { formatChatTime } from "@/lib/format-chat-time";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n/i18n-provider";
import { useAppLockOptional } from "@/components/preferences/app-lock-provider";

type ConversationSidebarProps = {
  /** Conversations shown in the main list (excludes per-user locked when app lock is on). */
  conversations: Conversation[];
  lockedConversations: Conversation[];
  lockedCount: number;
  hasAppLock: boolean;
  lockedVaultMode: "closed" | "auth" | "list";
  onOpenLockedVault: () => void;
  onCloseLockedVault: () => void;
  onLockedVaultVerified: () => void;
  verifyVaultPasscode: (code: string) => Promise<boolean>;
  verifyVaultBiometric: () => Promise<boolean>;
  vaultShowBiometric: boolean;
  vaultLabels: VaultUnlockLabels;
  activeId: string | null;
  onSelect: (id: string) => void;
  userLabel: string;
  userEmail: string | null;
  currentUserImage: string | null;
  currentUserName: string | null;
  onStartDirectChat?: (email: string) => Promise<{ error?: string }>;
  onOpenPeerInfo?: (conversation: Conversation) => void;
  onToggleConversationPin?: (conversationId: string, pinned: boolean) => Promise<{ error?: string }>;
};

export function ConversationSidebar({
  conversations,
  lockedConversations,
  lockedCount,
  hasAppLock,
  lockedVaultMode,
  onOpenLockedVault,
  onCloseLockedVault,
  onLockedVaultVerified,
  verifyVaultPasscode,
  verifyVaultBiometric,
  vaultShowBiometric,
  vaultLabels,
  activeId,
  onSelect,
  userLabel,
  userEmail,
  currentUserImage,
  currentUserName,
  onStartDirectChat,
  onOpenPeerInfo,
  onToggleConversationPin,
}: ConversationSidebarProps) {
  const { t } = useI18n();
  const appLock = useAppLockOptional();
  const [query, setQuery] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPending, setNewPending] = useState(false);
  const [newError, setNewError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    conversation: Conversation;
  } | null>(null);
  const [pinBusyId, setPinBusyId] = useState<string | null>(null);
  const longPressTimer = useRef<number | null>(null);

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current != null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close, true);
    return () => window.removeEventListener("click", close, true);
  }, [contextMenu]);

  const searchPool = lockedVaultMode === "list" ? lockedConversations : conversations;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return searchPool;
    return searchPool.filter((c) => c.peerLabel.toLowerCase().includes(q));
  }, [searchPool, query]);

  const renderRow = (c: Conversation, rowShowLock: boolean) => {
    const active = c.id === activeId;
    const rawPreview = c.lastMessagePreview?.trim() ?? "";
    const dm = parseDisappearingTimerPreview(rawPreview);
    const previewText =
      dm !== undefined
        ? dm === null
          ? t("chat.sidebarDisappearingOff")
          : t("chat.sidebarDisappearingOn", { label: disappearDurationShortLabel(dm, t) })
        : rawPreview || "\u00a0";
    return (
      <li key={c.id}>
        <div
          className={cn(
            "hover:bg-sidebar-accent flex w-full items-center gap-2 rounded-lg px-2 py-2 transition-colors",
            active && "bg-sidebar-accent"
          )}
          onContextMenu={
            onToggleConversationPin
              ? (e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, conversation: c });
                }
              : undefined
          }
          onTouchStart={
            onToggleConversationPin
              ? (e) => {
                  if (e.touches.length !== 1) return;
                  cancelLongPress();
                  const t = e.touches[0]!;
                  longPressTimer.current = window.setTimeout(() => {
                    longPressTimer.current = null;
                    setContextMenu({ x: t.clientX, y: t.clientY, conversation: c });
                  }, 550);
                }
              : undefined
          }
          onTouchEnd={onToggleConversationPin ? cancelLongPress : undefined}
          onTouchMove={onToggleConversationPin ? cancelLongPress : undefined}
        >
          <button
            type="button"
            className="relative shrink-0 rounded-full focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
            aria-label={t("chat.userInfoOpenAria")}
            onClick={() => onOpenPeerInfo?.(c)}
          >
            <UserAvatar
              name={c.peerLabel}
              email={c.peerEmail ?? null}
              image={c.peerAvatarUrl ?? null}
              size={36}
              variant="muted"
            />
            {c.peerOnline ? (
              <span className="absolute end-0 bottom-0 size-2 rounded-full bg-emerald-500 ring-2 ring-sidebar" />
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => onSelect(c.id)}
            className="hover:bg-sidebar-accent/60 flex min-w-0 flex-1 flex-col gap-0.5 rounded-md px-0.5 py-0.5 text-start transition-colors"
            aria-label={t("chat.openChat")}
          >
            <span className="flex w-full items-baseline justify-between gap-2">
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                {rowShowLock ? (
                  <Lock className="text-muted-foreground size-3.5 shrink-0 opacity-90" aria-hidden />
                ) : null}
                {c.isPinnedByMe ? (
                  <Pin
                    className="text-amber-600 dark:text-amber-400 size-3.5 shrink-0"
                    aria-label={t("chat.pinChat")}
                  />
                ) : null}
                <span
                  className={cn(
                    "truncate text-sm font-medium",
                    active && "text-sidebar-accent-foreground",
                    (c.unreadCount ?? 0) > 0 && !active && "font-semibold"
                  )}
                >
                  {c.peerLabel}
                </span>
              </span>
              <time
                className={cn(
                  "shrink-0 text-[10px]",
                  (c.unreadCount ?? 0) > 0 && !active
                    ? "font-medium text-emerald-700 dark:text-emerald-400"
                    : "text-muted-foreground"
                )}
                dateTime={new Date(c.updatedAt).toISOString()}
              >
                {formatChatTime(c.updatedAt)}
              </time>
            </span>
            <span className="flex w-full items-center gap-2">
              <p
                className={cn(
                  "text-muted-foreground flex min-w-0 flex-1 items-center gap-0.5 truncate text-xs",
                  (c.unreadCount ?? 0) > 0 && !active && "font-medium text-foreground"
                )}
              >
                <TwemojiText text={previewText} className="min-w-0 truncate" />
              </p>
              {(c.unreadCount ?? 0) > 0 ? (
                <span className="bg-chat-header text-chat-header-foreground flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums">
                  {(c.unreadCount ?? 0) > 99 ? "99+" : c.unreadCount}
                </span>
              ) : null}
            </span>
          </button>
        </div>
      </li>
    );
  };

  const handleCtxPin = useCallback(async () => {
    if (!contextMenu || !onToggleConversationPin) return;
    const conv = contextMenu.conversation;
    setPinBusyId(conv.id);
    try {
      await onToggleConversationPin(conv.id, !conv.isPinnedByMe);
      setContextMenu(null);
    } finally {
      setPinBusyId(null);
    }
  }, [contextMenu, onToggleConversationPin]);

  async function submitNewChat() {
    if (!onStartDirectChat) return;
    setNewError(null);
    setNewPending(true);
    try {
      const res = await onStartDirectChat(newEmail.trim());
      if (res.error) {
        setNewError(res.error);
        return;
      }
      setNewEmail("");
      setShowNew(false);
    } finally {
      setNewPending(false);
    }
  }

  return (
    <>
    <div className="bg-sidebar text-sidebar-foreground flex h-full min-h-0 w-full min-w-0 flex-col border-sidebar-border md:border-e">
      <div className="bg-chat-sidebar-header text-chat-header-foreground flex shrink-0 items-center justify-between gap-2 overflow-visible px-3 py-3 shadow-sm sm:gap-3 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <UserAvatar
            name={currentUserName}
            email={userEmail}
            image={currentUserImage}
            size={40}
            variant="header"
            className="shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">{t("chat.chats")}</p>
            <p className="truncate text-xs leading-tight text-white/80" title={userEmail ?? userLabel}>
              {userLabel}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {appLock?.hasAppLock ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-chat-header-foreground hover:bg-white/10 size-10 shrink-0 sm:size-11"
              aria-label={t("chat.lockAppAria")}
              title={t("chat.lockAppAria")}
              onClick={() => appLock.lockNow()}
            >
              <Lock className="size-5" aria-hidden />
            </Button>
          ) : null}
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="text-chat-header-foreground hover:bg-white/10 size-10 shrink-0 sm:size-11"
            aria-label={t("chat.settingsAria")}
          >
            <Link href="/settings" className="flex size-full items-center justify-center">
              <Settings className="size-5 shrink-0" aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
      <Separator />
      <div className="shrink-0 space-y-2 p-2">
        <div className="flex gap-2">
          <Input
            placeholder={t("chat.searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t("chat.searchAria")}
            className="bg-background h-9 flex-1"
          />
          {onStartDirectChat ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => setShowNew((v) => !v)}
              aria-label={t("chat.newDmAria")}
              title={t("chat.newDmTitle")}
            >
              <UserPlus className="size-4" />
            </Button>
          ) : null}
        </div>
        {showNew && onStartDirectChat ? (
          <div className="bg-background space-y-2 rounded-lg border p-2">
            <p className="text-muted-foreground text-xs">{t("chat.startDmHint")}</p>
            <Input
              placeholder={t("chat.peerEmailPlaceholder")}
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              disabled={newPending}
              className="h-9"
            />
            {newError ? <p className="text-destructive text-xs">{newError}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowNew(false)} disabled={newPending}>
                {t("common.cancel")}
              </Button>
              <Button type="button" size="sm" disabled={newPending || !newEmail.trim()} onClick={() => void submitNewChat()}>
                {newPending ? t("common.ellipsis") : t("chat.openChat")}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      <div className="relative min-h-0 flex-1">
        <AnimatePresence initial={false}>
          {(lockedVaultMode === "auth" || lockedVaultMode === "list") && (
            <motion.div
              key="locked-vault"
              role="dialog"
              aria-modal="true"
              aria-labelledby="locked-vault-title"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="bg-sidebar absolute inset-0 z-30 flex min-h-0 flex-col shadow-xl"
            >
              <div className="border-sidebar-border flex shrink-0 items-center gap-2 border-b px-2 py-2">
                <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={onCloseLockedVault}>
                  <ChevronLeft className="size-4 shrink-0" />
                  {t("chat.allChats")}
                </Button>
                <h2 id="locked-vault-title" className="text-muted-foreground truncate text-xs font-medium">
                  {lockedVaultMode === "auth" ? t("chat.lockedChatsUnlock") : t("chat.lockedChatsTitle")}
                </h2>
              </div>
              {lockedVaultMode === "auth" ? (
                <VaultUnlockPanel
                  open
                  labels={vaultLabels}
                  showBiometric={vaultShowBiometric}
                  verifyPasscode={verifyVaultPasscode}
                  verifyBiometric={verifyVaultBiometric}
                  onVerified={onLockedVaultVerified}
                  onCancel={onCloseLockedVault}
                />
              ) : (
                <ScrollArea className="min-h-0 flex-1">
                  <ul className="flex flex-col gap-0.5 p-2 pe-3">
                    {lockedConversations.length === 0 ? (
                      <li className="text-muted-foreground py-10 text-center text-sm">{t("chat.lockedChatsEmpty")}</li>
                    ) : (
                      lockedConversations.map((c) => renderRow(c, true))
                    )}
                  </ul>
                </ScrollArea>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <ScrollArea className="min-h-0 flex-1">
          <ul className="flex flex-col gap-0.5 p-2 pe-3">
            {lockedCount > 0 ? (
              <li className="pb-1">
                <button
                  type="button"
                  onClick={onOpenLockedVault}
                  className="hover:bg-sidebar-accent/80 flex w-full items-center gap-3 rounded-lg border border-dashed border-sidebar-border/80 px-3 py-2.5 text-start transition-colors"
                >
                  <FolderLock className="text-muted-foreground size-5 shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{t("chat.lockedChats")}</p>
                    <p className="text-muted-foreground text-[11px]">{t("chat.lockedChatsHint")}</p>
                  </div>
                  <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums">
                    {lockedCount > 99 ? "99+" : lockedCount}
                  </span>
                </button>
              </li>
            ) : null}
            {filtered.length === 0 ? (
              <li className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
                <MessageSquare className="size-8 opacity-50" />
                {query ? t("chat.noMatches") : lockedVaultMode === "list" ? t("chat.lockedChatsEmpty") : t("chat.noConversations")}
              </li>
            ) : (
              filtered.map((c) => renderRow(c, false))
            )}
          </ul>
        </ScrollArea>
      </div>
    </div>
    {contextMenu && onToggleConversationPin ? (
      <div
        role="menu"
        className="bg-popover text-popover-foreground border-border fixed z-[200] min-w-[11rem] rounded-md border p-1 shadow-lg"
        style={{
          left:
            typeof window !== "undefined"
              ? Math.max(8, Math.min(contextMenu.x, window.innerWidth - 220))
              : contextMenu.x,
          top:
            typeof window !== "undefined"
              ? Math.max(8, Math.min(contextMenu.y, window.innerHeight - 120))
              : contextMenu.y,
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          role="menuitem"
          className="hover:bg-accent focus:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-2 text-start text-sm"
          disabled={pinBusyId === contextMenu.conversation.id}
          onClick={() => void handleCtxPin()}
        >
          <Pin className="size-4 shrink-0 opacity-90" aria-hidden />
          {contextMenu.conversation.isPinnedByMe ? t("chat.unpinChat") : t("chat.pinChat")}
        </button>
      </div>
    ) : null}
    </>
  );
}
