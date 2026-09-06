import { connectDB } from "@/lib/mongodb";
import { defaultLocale, type Locale } from "@/i18n/config";
import {
  type AppTheme,
  type NotificationSoundId,
  type UserPreferencesDTO,
  isAppTheme,
  isLocale,
  isNotificationSound,
  normalizeWallpaper,
} from "@/lib/user-preferences";
import { User } from "@/server/models/User";

const defaultTheme: AppTheme = "system";

function normalizeTheme(raw: unknown): AppTheme {
  return isAppTheme(raw) ? raw : defaultTheme;
}

function normalizeLocale(raw: unknown): Locale {
  return isLocale(raw) ? raw : defaultLocale;
}

function normalizeBool(raw: unknown, fallback: boolean): boolean {
  return typeof raw === "boolean" ? raw : fallback;
}

function normalizeSound(raw: unknown): NotificationSoundId {
  return isNotificationSound(raw) ? raw : "ding";
}

function prefsFromDoc(p: Record<string, unknown> | undefined): UserPreferencesDTO {
  return {
    theme: normalizeTheme(p?.theme),
    locale: normalizeLocale(p?.locale),
    pushNotificationsEnabled: normalizeBool(p?.pushNotificationsEnabled, true),
    notificationSound: normalizeSound(p?.notificationSound),
    readReceiptsEnabled: normalizeBool(p?.readReceiptsEnabled, true),
    showOnlineStatus: normalizeBool(p?.showOnlineStatus, true),
    chatWallpaper: typeof p?.chatWallpaper === "string" ? normalizeWallpaper(p.chatWallpaper) : "",
  };
}

export async function getUserPreferences(userId: string): Promise<UserPreferencesDTO> {
  await connectDB();
  const user = await User.findById(userId).select("preferences").lean();
  if (!user) {
    throw new Error("User not found");
  }
  const p = user.preferences as Record<string, unknown> | undefined;
  return prefsFromDoc(p);
}

export type UserPreferencesPatch = Partial<UserPreferencesDTO>;

export async function updateUserPreferences(
  userId: string,
  patch: UserPreferencesPatch
): Promise<UserPreferencesDTO> {
  await connectDB();
  const current = await getUserPreferences(userId);
  const next: UserPreferencesDTO = {
    theme: patch.theme ?? current.theme,
    locale: patch.locale ?? current.locale,
    pushNotificationsEnabled: patch.pushNotificationsEnabled ?? current.pushNotificationsEnabled,
    notificationSound: patch.notificationSound ?? current.notificationSound,
    readReceiptsEnabled: patch.readReceiptsEnabled ?? current.readReceiptsEnabled,
    showOnlineStatus: patch.showOnlineStatus ?? current.showOnlineStatus,
    chatWallpaper:
      patch.chatWallpaper !== undefined ? normalizeWallpaper(patch.chatWallpaper) : current.chatWallpaper,
  };

  if (patch.theme != null && !isAppTheme(patch.theme)) {
    throw new Error("Invalid theme");
  }
  if (patch.locale != null && !isLocale(patch.locale)) {
    throw new Error("Invalid locale");
  }
  if (patch.notificationSound != null && !isNotificationSound(patch.notificationSound)) {
    throw new Error("Invalid notification sound");
  }

  const keys = Object.keys(patch) as (keyof UserPreferencesPatch)[];
  if (keys.length === 0) {
    return current;
  }

  await User.updateOne(
    { _id: userId },
    {
      $set: {
        "preferences.theme": next.theme,
        "preferences.locale": next.locale,
        "preferences.pushNotificationsEnabled": next.pushNotificationsEnabled,
        "preferences.notificationSound": next.notificationSound,
        "preferences.readReceiptsEnabled": next.readReceiptsEnabled,
        "preferences.showOnlineStatus": next.showOnlineStatus,
        "preferences.chatWallpaper": next.chatWallpaper,
      },
    }
  );
  return next;
}
