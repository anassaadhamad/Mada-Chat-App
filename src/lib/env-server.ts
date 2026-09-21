/**
 * Server-side configuration from `process.env`.
 * Defaults preserve previous hardcoded behavior; set variables in `.env` to override.
 */

function int(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (raw == null || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function str(name: string, fallback: string): string {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : fallback;
}

/** HTTP server bind host (custom Node server in `server/index.ts`). */
export function envServerHost(): string {
  const raw = process.env.HOST?.trim();
  if (!raw) {
    return process.env.NODE_ENV === "production" ? "0.0.0.0" : "localhost";
  }
  // Server bind host must be a local network interface (like 0.0.0.0, 127.0.0.1, or localhost).
  // If a full URL or external domain is accidentally provided (e.g. https://... or domain.railway.app),
  // fallback safely to "0.0.0.0" to prevent getaddrinfo ENOTFOUND crashes.
  if (raw.includes("://") || raw.includes("/") || (raw.includes(".") && !/^\d{1,3}(\.\d{1,3}){3}$/.test(raw))) {
    return "0.0.0.0";
  }
  return raw;
}

/** HTTP server port. */
export function envServerPort(): number {
  return int("PORT", 3000);
}

/**
 * Comma-separated browser origins for Socket.io CORS when `SOCKET_IO_CORS_ORIGIN` is unset.
 * Override with `SOCKET_IO_CORS_ORIGIN` (full list) or `NEXT_PUBLIC_APP_URL` (single origin).
 */
export function envSocketIoCorsOriginsFallback(): string {
  return str(
    "SOCKET_IO_CORS_ORIGINS_DEFAULT",
    "http://localhost:3000,http://127.0.0.1:3000"
  );
}

/** Engine.io / Socket.io path (must match client `path` option). */
export function envSocketIoPath(): string {
  return str("SOCKET_IO_PATH", "/socket.io");
}

/** HTTP server `headersTimeout` (ms) for slow networks before body streams. */
export function envHttpServerHeadersTimeoutMs(): number {
  return int("HTTP_SERVER_HEADERS_TIMEOUT_MS", 120_000);
}

// —— Messages / pagination ——

export function envMessageMaxContentLength(): number {
  return int("MESSAGE_MAX_CONTENT_LENGTH", 8000);
}

export function envMessageReplyExcerptMax(): number {
  return int("MESSAGE_REPLY_EXCERPT_MAX_LENGTH", 200);
}

/** Stored `replyTo.excerpt` max length (Mongoose schema). */
export function envMessageReplyExcerptSchemaMax(): number {
  return int("MESSAGE_REPLY_EXCERPT_SCHEMA_MAX", 500);
}

export function envMessageFileNameMax(): number {
  return int("MESSAGE_FILE_NAME_MAX_LENGTH", 512);
}

export function envMessageEmojiMax(): number {
  return int("MESSAGE_EMOJI_MAX_LENGTH", 16);
}

export function envMessageListInitialLimit(): number {
  return int("MESSAGE_LIST_INITIAL_LIMIT", 80);
}

export function envMessageListOlderPageDefault(): number {
  return int("MESSAGE_LIST_OLDER_PAGE_DEFAULT", 100);
}

export function envMessageListOlderPageMax(): number {
  return int("MESSAGE_LIST_OLDER_PAGE_MAX", 200);
}

// —— AI (OpenRouter / OpenAI-compatible; server-only) ——

export function envAiApiKey(): string | null {
  const v =
    process.env.OPENROUTER_API_KEY?.trim() ||
    process.env.AI_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim();
  return v && v.length > 0 ? v : null;
}

export function envAiModel(): string {
  const v =
    process.env.OPENROUTER_MODEL?.trim() ||
    process.env.AI_MODEL?.trim() ||
    process.env.OPENAI_CHAT_MODEL?.trim();
  return v && v.length > 0 ? v : "meta-llama/llama-3.3-70b-instruct";
}

export function envAiBaseUrl(): string {
  const raw =
    process.env.OPENROUTER_BASE_URL?.trim() ||
    process.env.AI_BASE_URL?.trim() ||
    "https://openrouter.ai/api/v1";
  return raw.replace(/\/+$/, "");
}

/** Backward compatibility aliases */
export const envOpenAiApiKey = envAiApiKey;
export const envOpenAiChatModel = envAiModel;

/** IANA timezone for AI transcript timestamps and current-time context (e.g. Africa/Cairo, America/New_York). */
export function envAiAgentTimeZone(): string {
  return str("AI_AGENT_TIME_ZONE", "UTC");
}

/** Tail size for AI persona transcript (chronological). Lower = fewer input tokens; clamped 12–60. */
export function envAiAgentHistoryMessageLimit(): number {
  const n = int("AI_AGENT_HISTORY_MESSAGE_LIMIT", 36);
  return Math.min(60, Math.max(12, Number.isFinite(n) && n > 0 ? n : 36));
}

/** OpenAI output cap per persona completion; clamped 200–2048. */
export function envAiAgentMaxCompletionTokens(): number {
  const n = int("AI_AGENT_MAX_COMPLETION_TOKENS", 512);
  return Math.min(2048, Math.max(200, Number.isFinite(n) && n > 0 ? n : 512));
}

// —— Link preview fetch ——

export function envLinkPreviewMaxRedirects(): number {
  return int("LINK_PREVIEW_MAX_REDIRECTS", 5);
}

export function envLinkPreviewMaxBodyBytes(): number {
  return int("LINK_PREVIEW_MAX_BODY_BYTES", 450_000);
}

export function envLinkPreviewFetchTimeoutMs(): number {
  return int("LINK_PREVIEW_FETCH_TIMEOUT_MS", 12_000);
}

export function envLinkPreviewUserAgent(): string {
  return str(
    "LINK_PREVIEW_USER_AGENT",
    "Mozilla/5.0 (compatible; MadaLinkBot/1.0; +https://example.invalid) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );
}

export function envLinkPreviewOgDescriptionMax(): number {
  return int("LINK_PREVIEW_OG_DESCRIPTION_MAX_LENGTH", 320);
}

export function envLinkPreviewOgTitleMax(): number {
  return int("LINK_PREVIEW_OG_TITLE_MAX_LENGTH", 300);
}

// —— Upload (server cap; client mirrors via NEXT_PUBLIC_UPLOAD_MAX_BYTES) ——

const ONE_GIB = 1024 * 1024 * 1024;

export function envUploadDefaultMaxBytes(): number {
  return int("UPLOAD_DEFAULT_MAX_BYTES", ONE_GIB);
}

export function envUploadMaxBytesCap(): number {
  return int("UPLOAD_MAX_BYTES_CAP", 2 * ONE_GIB);
}

export function envUploadClientTimeoutMs(): number {
  return int("UPLOAD_CLIENT_TIMEOUT_MS", 0);
}

// —— Web Push ——

export function envWebPushSubjectDefault(): string {
  return str("WEB_PUSH_SUBJECT_DEFAULT", "mailto:noreply@localhost");
}

// —— Admin API ——

export function envAdminUsersPageLimitDefault(): number {
  return int("ADMIN_USERS_PAGE_LIMIT_DEFAULT", 20);
}

export function envAdminUsersPageLimitMax(): number {
  return int("ADMIN_USERS_PAGE_LIMIT_MAX", 100);
}

export function envAdminUsersPageLimitMin(): number {
  return int("ADMIN_USERS_PAGE_LIMIT_MIN", 5);
}

export function envAdminUserConversationsMax(): number {
  return int("ADMIN_USER_CONVERSATIONS_MAX", 200);
}

export function envAdminReportPreviewMax(): number {
  return int("ADMIN_REPORT_MESSAGE_PREVIEW_MAX", 200);
}

export function envAdminReportsListDefault(): number {
  return int("ADMIN_REPORTS_LIST_DEFAULT", 50);
}

export function envAdminReportsListMax(): number {
  return int("ADMIN_REPORTS_LIST_MAX", 200);
}

export function envMessageReportReasonMax(): number {
  return int("MESSAGE_REPORT_REASON_MAX_LENGTH", 2000);
}

export function envPushSenderDisplayMaxLength(): number {
  return int("PUSH_SENDER_DISPLAY_MAX_LENGTH", 120);
}

export function envPasswordMinLength(): number {
  return int("PASSWORD_MIN_LENGTH", 8);
}

/** ZegoCloud numeric App ID (from console). */
export function envZegoAppId(): number | null {
  const raw = process.env.ZEGO_APP_ID?.trim();
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** ZegoCloud App server secret — server-only; never expose to the client. */
export function envZegoServerSecret(): string | null {
  const v = process.env.ZEGO_SERVER_SECRET?.trim();
  return v && v.length > 0 ? v : null;
}

export function envZegoCallsConfigured(): boolean {
  return envZegoAppId() != null && envZegoServerSecret() != null;
}
