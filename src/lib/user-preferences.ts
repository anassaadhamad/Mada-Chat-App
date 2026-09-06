import { locales, type Locale } from "@/i18n/config";

export const appThemes = ["light", "dark", "system"] as const;
export type AppTheme = (typeof appThemes)[number];

export const notificationSounds = ["ding", "pop", "chime", "none"] as const;
export type NotificationSoundId = (typeof notificationSounds)[number];

export type UserPreferencesDTO = {
  theme: AppTheme;
  locale: Locale;
  pushNotificationsEnabled: boolean;
  notificationSound: NotificationSoundId;
  readReceiptsEnabled: boolean;
  showOnlineStatus: boolean;
  chatWallpaper: string;
};

export function isAppTheme(value: unknown): value is AppTheme {
  return typeof value === "string" && (appThemes as readonly string[]).includes(value);
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function isNotificationSound(value: unknown): value is NotificationSoundId {
  return typeof value === "string" && (notificationSounds as readonly string[]).includes(value);
}

export function normalizeWallpaper(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const s = raw.trim();
  if (s.length > 2048) return s.slice(0, 2048);
  if (s === "") return "";
  if (s.startsWith("#")) {
    return /^#[0-9a-fA-F]{6}$/.test(s) ? s : "";
  }
  if (s.startsWith("/api/files/") || s.startsWith("/uploads/")) return s;
  try {
    const u = new URL(s);
    if (u.protocol === "https:") return s;
    if (u.protocol === "http:" && u.hostname === "localhost") return s;
    if (u.protocol === "http:" && u.hostname === "127.0.0.1") return s;
  } catch {
    return "";
  }
  return "";
}
