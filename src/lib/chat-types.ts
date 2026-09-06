export type MessageStatus = "sending" | "sent" | "failed";

export type MessageFileType = "image" | "video" | "pdf" | "file" | "audio";

export type MessageReplyRef = {
  messageId: string;
  excerpt: string;
  senderId: string;
  /** Original sender display name (populated when loading history). */
  senderLabel?: string;
  /** Referenced message is missing from the conversation (e.g. deleted). */
  deleted?: boolean;
  /** Original attachment type for quote preview styling. */
  replyMediaType?: MessageFileType;
};

/** Aggregated reactions for the client (emoji → list of reactor user ids). */
export type MessageReactionSummary = {
  emoji: string;
  userIds: string[];
};

/** Server-authored in-thread notice (not a normal user bubble). */
export type ChatSystemNotice = {
  kind: "disappearing_timer";
  /** TTL seconds when enabled; `null` when disappearing messages were turned off. */
  seconds: number | null;
};

/** Client-only: attachment upload progress / processing (optimistic messages). */
export type MessageAttachmentUploadState = {
  phase: "uploading" | "processing";
  /** 0–100 while uploading */
  progress: number;
  speedBps?: number;
  totalBytes?: number;
  /** Set when upload or post-message failed */
  error?: string;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: number;
  /** Set when the sender last edited the text (ms since epoch). */
  editedAt?: number;
  /** Tombstone: content and attachments are hidden in the UI. */
  deleted?: boolean;
  status?: MessageStatus;
  replyTo?: MessageReplyRef;
  /** Attachment served from our `/uploads` static route or absolute URL if migrated later. */
  fileUrl?: string;
  fileType?: MessageFileType;
  fileName?: string;
  /** Byte length when known (persisted from upload). */
  fileSize?: number;
  reactions?: MessageReactionSummary[];
  attachmentUpload?: MessageAttachmentUploadState;
  /** Disappearing message TTL snapshot at send (seconds). */
  disappearTtlSec?: number;
  /** Server-set wall-clock expiry (ms) after peer read; omitted until read. */
  disappearExpiresAt?: number;
  /** When countdown started (ms), aligned with peer read. */
  disappearStartedAt?: number;
  /** True when the server created this message via AI autopilot (skips further autopilot triggers). */
  fromAiAgent?: boolean;
  /** Present for system timeline rows (e.g. disappearing messages toggled). */
  systemNotice?: ChatSystemNotice;
};

export type Conversation = {
  id: string;
  peerLabel: string;
  peerUserId: string;
  /** Other participant's avatar URL (User.image). */
  peerAvatarUrl?: string | null;
  peerBio?: string;
  peerEmail?: string;
  lastMessagePreview: string;
  updatedAt: number;
  peerOnline?: boolean;
  unreadCount?: number;
  /** Other participant’s read cursor (for ticks on your messages). */
  peerLastReadAt?: number;
  peerLastSeenAt?: number | null;
  blockedByMe?: boolean;
  blockedByPeer?: boolean;
  /** Current user hid this conversation in Locked chats (server: `lockedByUserIds`). */
  isLockedByMe?: boolean;
  /** Shared disappearing-messages TTL in seconds (5, 60, 3600, 86400); null/undefined = off. */
  disappearingMessageSeconds?: number | null;
  /** Current user pinned this DM to the top of their inbox (`pinnedAtByUser` on server). */
  isPinnedByMe?: boolean;
  /** When the current user pinned this chat (ms); 0 if unpinned. */
  pinnedAtMs?: number;
};

/** Server → client when a contact updates their public profile (Socket.IO `peer:profile`). */
export type PeerProfileSocketPayload = {
  userId: string;
  peerLabel: string;
  peerAvatarUrl: string | null;
  peerBio: string;
  peerEmail: string;
};

/** Server → client when block state changes (Socket.IO `user:blocked`). */
export type UserBlockedSocketPayload = {
  conversationId: string | null;
  blockerId: string;
  blockedUserId: string;
  blocked: boolean;
};

/** Server → client for the acting user only (Socket.IO `conversation:pin`). */
export type ConversationPinSocketPayload = {
  conversationId: string;
  pinned: boolean;
  pinnedAtMs: number | null;
};
