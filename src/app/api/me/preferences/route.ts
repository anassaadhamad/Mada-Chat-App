import { NextResponse } from "next/server";
import { requireActiveUser } from "@/server/require-active-user";
import type { Locale } from "@/i18n/config";
import {
  isAppTheme,
  isLocale,
  isNotificationSound,
  normalizeWallpaper,
  type AppTheme,
  type NotificationSoundId,
} from "@/lib/user-preferences";
import { getUserPreferences, updateUserPreferences, type UserPreferencesPatch } from "@/server/user-preferences.service";

export async function GET() {
  const gate = await requireActiveUser();
  if (!gate.ok) return gate.response;
  const userId = gate.userId;
  try {
    const prefs = await getUserPreferences(userId);
    return NextResponse.json(prefs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "User not found") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to load preferences" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const gate = await requireActiveUser();
  if (!gate.ok) return gate.response;
  const userId = gate.userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const patch: UserPreferencesPatch = {};
  if ("theme" in body) {
    const theme = (body as { theme: unknown }).theme;
    if (!isAppTheme(theme)) {
      return NextResponse.json({ error: "Invalid theme" }, { status: 400 });
    }
    patch.theme = theme as AppTheme;
  }
  if ("locale" in body) {
    const locale = (body as { locale: unknown }).locale;
    if (!isLocale(locale)) {
      return NextResponse.json({ error: "Invalid locale" }, { status: 400 });
    }
    patch.locale = locale as Locale;
  }
  if ("pushNotificationsEnabled" in body) {
    const v = (body as { pushNotificationsEnabled: unknown }).pushNotificationsEnabled;
    if (typeof v !== "boolean") {
      return NextResponse.json({ error: "Invalid pushNotificationsEnabled" }, { status: 400 });
    }
    patch.pushNotificationsEnabled = v;
  }
  if ("notificationSound" in body) {
    const s = (body as { notificationSound: unknown }).notificationSound;
    if (!isNotificationSound(s)) {
      return NextResponse.json({ error: "Invalid notification sound" }, { status: 400 });
    }
    patch.notificationSound = s as NotificationSoundId;
  }
  if ("readReceiptsEnabled" in body) {
    const v = (body as { readReceiptsEnabled: unknown }).readReceiptsEnabled;
    if (typeof v !== "boolean") {
      return NextResponse.json({ error: "Invalid readReceiptsEnabled" }, { status: 400 });
    }
    patch.readReceiptsEnabled = v;
  }
  if ("showOnlineStatus" in body) {
    const v = (body as { showOnlineStatus: unknown }).showOnlineStatus;
    if (typeof v !== "boolean") {
      return NextResponse.json({ error: "Invalid showOnlineStatus" }, { status: 400 });
    }
    patch.showOnlineStatus = v;
  }
  if ("chatWallpaper" in body) {
    patch.chatWallpaper = normalizeWallpaper((body as { chatWallpaper: unknown }).chatWallpaper);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  try {
    const prefs = await updateUserPreferences(userId, patch);
    return NextResponse.json(prefs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Invalid theme" || msg === "Invalid locale" || msg === "Invalid notification sound") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to save preferences" }, { status: 500 });
  }
}
