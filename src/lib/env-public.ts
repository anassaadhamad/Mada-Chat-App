/**
 * Browser-safe config from `NEXT_PUBLIC_*` and runtime `window` (no secrets).
 */

function int(name: string, fallback: number): number {
  if (typeof process === "undefined") return fallback;
  const raw = process.env[name]?.trim();
  if (raw == null || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function str(name: string, fallback: string): string {
  if (typeof process === "undefined") return fallback;
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : fallback;
}

/**
 * Optional absolute API base (e.g. `https://api.example.com` or `http://127.0.0.1:3000`).
 * When unset, client uses same-origin relative paths (pass full paths like `/api/me/...`).
 */
export function publicApiUrl(suffix: string): string {
  const path = suffix.startsWith("/") ? suffix : `/${suffix}`;
  if (typeof process === "undefined") return path;
  const base = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "") ?? "";
  if (base.length > 0) return `${base}${path}`;
  return path;
}

/** Optional Socket.io origin; when unset, client uses `window.location.origin`. */
export function envPublicSocketUrl(): string | undefined {
  if (typeof process === "undefined") return undefined;
  const u = process.env.NEXT_PUBLIC_SOCKET_URL?.trim();
  return u && u.length > 0 ? u : undefined;
}

export function envPublicSocketIoPath(): string {
  return str("NEXT_PUBLIC_SOCKET_IO_PATH", "/socket.io");
}

export function envPublicSocketReconnectDelayMs(): number {
  return int("NEXT_PUBLIC_SOCKET_RECONNECT_DELAY_MS", 1000);
}

export function envPublicSocketReconnectDelayMaxMs(): number {
  return int("NEXT_PUBLIC_SOCKET_RECONNECT_DELAY_MAX_MS", 8000);
}

export function envPublicSocketTimeoutMs(): number {
  return int("NEXT_PUBLIC_SOCKET_TIMEOUT_MS", 20000);
}

/** Twemoji SVG asset base URL (must end with `/` for twemoji `base` option). */
export function envPublicTwemojiAssetsBase(): string {
  const base = str(
    "NEXT_PUBLIC_TWEMOJI_ASSETS_BASE",
    "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/"
  );
  return base.endsWith("/") ? base : `${base}/`;
}

/** Client-side history fetch `limit` query (must be ≤ server `MESSAGE_LIST_OLDER_PAGE_MAX` in practice). */
export function envPublicChatHistoryFetchLimit(): number {
  return int("NEXT_PUBLIC_CHAT_HISTORY_FETCH_LIMIT", 100);
}

const ONE_GIB = 1024 * 1024 * 1024;

/** Client default max upload bytes (should match server `UPLOAD_DEFAULT_MAX_BYTES` in typical setups). */
export function envPublicUploadDefaultMaxBytes(): number {
  return int("NEXT_PUBLIC_UPLOAD_DEFAULT_MAX_BYTES", ONE_GIB);
}

/** Client-side ceiling when parsing `NEXT_PUBLIC_UPLOAD_MAX_BYTES`. */
export function envPublicUploadMaxBytesCap(): number {
  return int("NEXT_PUBLIC_UPLOAD_MAX_BYTES_CAP", 2 * ONE_GIB);
}

export function envPublicUploadClientTimeoutMs(): number {
  return int("NEXT_PUBLIC_UPLOAD_CLIENT_TIMEOUT_MS", 0);
}

/** Must match server `PASSWORD_MIN_LENGTH` when both are set. */
export function envPublicPasswordMinLength(): number {
  return int("NEXT_PUBLIC_PASSWORD_MIN_LENGTH", 8);
}

/** Inactivity duration (ms) before the chat app auto-locks when a passcode is configured. */
export function envPublicAppLockTimeoutMs(): number {
  return int("NEXT_PUBLIC_APP_LOCK_TIMEOUT_MS", 300_000);
}
