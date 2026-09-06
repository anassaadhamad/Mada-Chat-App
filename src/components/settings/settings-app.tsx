"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  Bell,
  ChevronLeft,
  Loader2,
  Lock,
  Palette,
  Shield,
  Trash2,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user/user-avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useI18n } from "@/components/i18n/i18n-provider";
import { useAppTheme, type AppTheme } from "@/components/theme/app-theme-provider";
import { useUserPreferences } from "@/components/preferences/user-preferences-context";
import { postAuthRedirectUrl } from "@/lib/auth-callback-path";
import { envPublicPasswordMinLength, publicApiUrl } from "@/lib/env-public";
import { playNotificationSoundPreview } from "@/lib/notification-sound-preview";
import type { NotificationSoundId } from "@/lib/user-preferences";
import { uploadFileWithProgress } from "@/lib/upload-with-progress";
import { getClientUploadMaxBytes } from "@/lib/upload-config";
import { formatFileSize } from "@/lib/format-file-size";
import { describeUploadError } from "@/lib/describe-upload-error";
import { validateClientFileBeforeUpload } from "@/lib/upload-validation";
import { cn } from "@/lib/utils";
import { AppLockSettingsSection } from "@/components/preferences/app-lock-settings-section";

type SectionId = "general" | "security" | "notifications" | "appearance" | "privacy" | "account";

const PRESET_WALLPAPERS = ["#0f172a", "#1e293b", "#14532d", "#1e3a5f", "#312e81", ""];

export function SettingsApp() {
  const router = useRouter();
  const { t, locale, setLocale } = useI18n();
  const { update } = useSession();
  const { theme, setTheme } = useAppTheme();
  const { preferences, patchPreferences, optimisticPreferences } = useUserPreferences();

  const [section, setSection] = useState<SectionId>("general");
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [hasPassword, setHasPassword] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileHydrating, setProfileHydrating] = useState(true);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [cfPw, setCfPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  const [blocked, setBlocked] = useState<{ id: string; name: string | null; email: string }[]>([]);
  const [blockedBusy, setBlockedBusy] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const [photoBusy, setPhotoBusy] = useState(false);

  const switchKnob = (on: boolean) =>
    cn(
      "bg-background pointer-events-none absolute top-0.5 left-0.5 size-6 rounded-full shadow transition-transform duration-200 ease-out",
      on ? "translate-x-5" : "translate-x-0"
    );

  const nav = useMemo(
    () =>
      [
        { id: "general" as const, label: t("settings.sectionGeneral"), icon: UserRound },
        { id: "security" as const, label: t("settings.sectionSecurity"), icon: Lock },
        { id: "notifications" as const, label: t("settings.sectionNotifications"), icon: Bell },
        { id: "appearance" as const, label: t("settings.sectionAppearance"), icon: Palette },
        { id: "privacy" as const, label: t("settings.sectionPrivacy"), icon: Shield },
        { id: "account" as const, label: t("settings.sectionAccount"), icon: Trash2 },
      ] satisfies { id: SectionId; label: string; icon: typeof UserRound }[],
    [t]
  );

  useEffect(() => {
    let cancelled = false;
    setProfileHydrating(true);
    void (async () => {
      try {
        const res = await fetch(publicApiUrl("/api/me"));
        if (!res.ok) return;
        const data = (await res.json()) as {
          profile?: { name?: string | null; bio?: string; image?: string | null; hasPassword?: boolean };
        };
        if (cancelled) return;
        const p = data.profile;
        if (p) {
          setName(p.name ?? "");
          setBio(typeof p.bio === "string" ? p.bio : "");
          setImage(p.image ?? null);
          setHasPassword(!!p.hasPassword);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setProfileHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadBlocked = useCallback(async () => {
    setBlockedBusy(true);
    try {
      const res = await fetch(publicApiUrl("/api/me/blocks"));
      if (!res.ok) return;
      const data = (await res.json()) as {
        blocked?: { id: string; name: string | null; email: string }[];
      };
      setBlocked(data.blocked ?? []);
    } finally {
      setBlockedBusy(false);
    }
  }, []);

  useEffect(() => {
    if (section === "privacy") void loadBlocked();
  }, [section, loadBlocked]);

  const saveProfile = async () => {
    setProfileBusy(true);
    setProfileMsg(null);
    try {
      const patchImage =
        image === null
          ? null
          : typeof image === "string" && image.startsWith("blob:")
            ? undefined
            : image;
      const body: { name: string; bio: string; image?: string | null } = { name, bio };
      if (patchImage !== undefined) body.image = patchImage;
      const res = await fetch(publicApiUrl("/api/me/profile"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const sessionUser: { name?: string; bio: string; image?: string | null } = { bio };
      const nt = name.trim();
      if (nt) sessionUser.name = nt;
      if (image === null) sessionUser.image = null;
      else if (typeof image === "string" && !image.startsWith("blob:")) sessionUser.image = image;
      await update?.({ user: sessionUser });
      setProfileMsg(t("settings.profileSaved"));
    } catch {
      setProfileMsg(t("settings.errorGeneric"));
    } finally {
      setProfileBusy(false);
    }
  };

  const onPhoto = async (file: File | null) => {
    if (!file) return;
    const maxBytes = getClientUploadMaxBytes();
    const gate = validateClientFileBeforeUpload(file, maxBytes);
    if (gate === "tooLarge") {
      setProfileMsg(t("upload.clientTooLarge", { size: formatFileSize(maxBytes) }));
      return;
    }
    if (gate === "badType") {
      setProfileMsg(t("upload.clientBadType"));
      return;
    }
    const prevImage = image;
    const blobUrl = URL.createObjectURL(file);
    setImage(blobUrl);
    setPhotoBusy(true);
    setProfileMsg(null);
    try {
      const { url } = await uploadFileWithProgress(file, {
        onProgress: () => {},
      });
      if (blobUrl.startsWith("blob:")) URL.revokeObjectURL(blobUrl);
      setImage(url);
      const res = await fetch(publicApiUrl("/api/me/profile"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: url }),
      });
      if (!res.ok) throw new Error();
      await update?.({ user: { image: url, name: name.trim() || undefined, bio } });
      setProfileMsg(t("settings.profileSaved"));
    } catch (e) {
      if (blobUrl.startsWith("blob:")) URL.revokeObjectURL(blobUrl);
      setImage(prevImage);
      setProfileMsg(
        describeUploadError(e, {
          cancelled: t("upload.cancelled"),
          generic: t("settings.errorGeneric"),
        })
      );
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    setProfileMsg(null);
    setPhotoBusy(true);
    const prev = image;
    setImage(null);
    try {
      const res = await fetch(publicApiUrl("/api/me/profile"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: null }),
      });
      if (!res.ok) throw new Error();
      await update?.({
        user: {
          image: null,
          name: name.trim() || undefined,
          bio,
        },
      });
      setProfileMsg(t("settings.profileSaved"));
    } catch {
      setImage(prev);
      setProfileMsg(t("settings.errorGeneric"));
    } finally {
      setPhotoBusy(false);
    }
  };

  const submitPassword = async () => {
    setPwBusy(true);
    setPwMsg(null);
    const minLen = envPublicPasswordMinLength();
    if (newPw.length < minLen) {
      setPwMsg(t("settings.passwordTooShort", { min: minLen }));
      setPwBusy(false);
      return;
    }
    if (newPw !== cfPw) {
      setPwMsg(t("settings.passwordMismatch"));
      setPwBusy(false);
      return;
    }
    try {
      const res = await fetch(publicApiUrl("/api/me/password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw, confirmPassword: cfPw }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "");
      }
      setPwMsg(t("settings.passwordChanged"));
      setOldPw("");
      setNewPw("");
      setCfPw("");
    } catch {
      setPwMsg(t("settings.errorGeneric"));
    } finally {
      setPwBusy(false);
    }
  };

  const revokeAll = async () => {
    try {
      const res = await fetch(publicApiUrl("/api/me/sessions"), { method: "POST" });
      if (!res.ok) throw new Error();
      await update?.();
      setPwMsg(t("settings.revoked"));
    } catch {
      setPwMsg(t("settings.errorGeneric"));
    }
  };

  const togglePush = async (next: boolean) => {
    try {
      await patchPreferences({ pushNotificationsEnabled: next });
      if (!next && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready.catch(() => null);
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          await fetch(publicApiUrl("/api/push/unsubscribe"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe().catch(() => {});
        }
      }
    } catch {
      /* patchPreferences rolls back */
    }
  };

  const toggleRead = async (next: boolean) => {
    try {
      await patchPreferences({ readReceiptsEnabled: next });
    } catch {
      /* rolled back */
    }
  };

  const toggleOnline = async (next: boolean) => {
    try {
      await patchPreferences({ showOnlineStatus: next });
    } catch {
      /* rolled back */
    }
  };

  const setSound = async (s: NotificationSoundId) => {
    try {
      await patchPreferences({ notificationSound: s });
    } catch {
      /* rolled back */
    }
  };

  const setWallpaper = async (w: string) => {
    try {
      await patchPreferences({ chatWallpaper: w });
    } catch {
      /* rolled back */
    }
  };

  const unblock = async (id: string) => {
    try {
      const res = await fetch(publicApiUrl("/api/me/blocks"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: id, blocked: false }),
      });
      if (!res.ok) throw new Error();
      setBlocked((prev) => prev.filter((x) => x.id !== id));
    } catch {
      /* ignore */
    }
  };

  const deleteAccount = async () => {
    setDeleteBusy(true);
    setDeleteErr(null);
    try {
      const res = await fetch(publicApiUrl("/api/me/account"), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: deletePhrase.trim() }),
      });
      if (!res.ok) throw new Error();
      await signOut({ callbackUrl: postAuthRedirectUrl("/") });
    } catch {
      setDeleteErr(t("settings.errorGeneric"));
      setDeleteBusy(false);
    }
  };

  const themes: { id: AppTheme; label: string }[] = [
    { id: "light", label: t("settings.themeLight") },
    { id: "dark", label: t("settings.themeDark") },
    { id: "system", label: t("settings.themeSystem") },
  ];

  const soundOptions: { id: NotificationSoundId; label: string }[] = [
    { id: "ding", label: t("settings.soundDing") },
    { id: "pop", label: t("settings.soundPop") },
    { id: "chime", label: t("settings.soundChime") },
    { id: "none", label: t("settings.soundNone") },
  ];

  const NavButton = ({
    id,
    label,
    icon: Icon,
  }: {
    id: SectionId;
    label: string;
    icon: typeof UserRound;
  }) => (
    <button
      type="button"
      onClick={() => setSection(id)}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm font-medium transition-colors",
        section === id ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"
      )}
    >
      <Icon className="size-4 shrink-0 opacity-80" />
      <span className="truncate">{label}</span>
    </button>
  );

  return (
    <div className="bg-muted/30 text-foreground flex min-h-[100dvh] flex-col md:flex-row">
      <header className="border-border bg-background/85 flex h-14 shrink-0 items-center gap-2 border-b px-3 pt-[max(0px,env(safe-area-inset-top))] backdrop-blur-md md:hidden">
        <Button type="button" variant="ghost" size="icon" onClick={() => router.back()} aria-label={t("settings.back")}>
          <ChevronLeft className="size-5 rtl:rotate-180" />
        </Button>
        <h1 className="text-lg font-semibold">{t("settings.title")}</h1>
      </header>

      <aside className="border-border bg-background/90 hidden w-56 shrink-0 flex-col border-e p-3 md:flex">
        <div className="mb-3 flex items-center gap-2 px-1">
          <Button type="button" variant="ghost" size="icon" onClick={() => router.back()} aria-label={t("settings.back")}>
            <ChevronLeft className="size-5 rtl:rotate-180" />
          </Button>
          <h1 className="text-lg font-semibold">{t("settings.title")}</h1>
        </div>
        <p className="text-muted-foreground mb-2 px-2 text-[11px] font-semibold tracking-wider uppercase">
          {t("settings.hubNav")}
        </p>
        <nav className="flex flex-col gap-0.5">
          {nav.map((item) => (
            <NavButton key={item.id} {...item} />
          ))}
        </nav>
        <div className="mt-auto space-y-1 pt-4">
          <Button variant="outline" size="sm" className="w-full" asChild>
            <Link href="/chat">{t("settings.openChat")}</Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive w-full"
            onClick={() => void signOut({ callbackUrl: postAuthRedirectUrl("/") })}
          >
            {t("settings.signOut")}
          </Button>
        </div>
      </aside>

      <nav className="border-border bg-background/95 flex gap-1 overflow-x-auto border-b px-2 py-2 md:hidden">
        {nav.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSection(item.id)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium",
              section === item.id ? "bg-primary text-primary-foreground" : "bg-muted"
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-8 px-4 py-6 pb-[max(5rem,env(safe-area-inset-bottom))] md:pb-10">
        {section === "general" && (
          <section className="bg-card space-y-4 rounded-2xl border p-5 shadow-sm">
            <h2 className="text-base font-semibold">{t("settings.sectionGeneral")}</h2>
            {profileHydrating ? (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                {t("settings.profileLoading")}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="dn">{t("settings.displayName")}</Label>
                  <Input
                    id="dn"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={120}
                    disabled={profileBusy}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bio">{t("settings.bio")}</Label>
                  <div className="relative">
                    <Textarea
                      id="bio"
                      rows={4}
                      placeholder={t("settings.bioPlaceholder")}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      maxLength={500}
                      disabled={profileBusy}
                      className={profileBusy ? "opacity-60" : undefined}
                      aria-busy={profileBusy}
                    />
                    {profileBusy ? (
                      <div
                        className="bg-background/50 pointer-events-none absolute inset-0 flex items-center justify-center rounded-md"
                        aria-hidden
                      >
                        <Loader2 className="text-primary size-8 animate-spin" />
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("settings.profilePhoto")}</Label>
                  <div className="flex flex-wrap items-center gap-3">
                    <UserAvatar
                      name={name}
                      email={null}
                      image={image}
                      size={64}
                      variant="muted"
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <Input
                        type="file"
                        accept="image/*"
                        className="max-w-xs text-sm"
                        disabled={photoBusy || profileBusy}
                        onChange={(e) => void onPhoto(e.target.files?.[0] ?? null)}
                      />
                      {image && !image.startsWith("blob:") ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-fit"
                          disabled={photoBusy || profileBusy}
                          onClick={() => void removePhoto()}
                        >
                          {t("settings.removePhoto")}
                        </Button>
                      ) : null}
                      <p className="text-muted-foreground text-xs">{t("settings.photoHint")}</p>
                    </div>
                  </div>
                </div>
                {profileMsg ? <p className="text-muted-foreground text-sm">{profileMsg}</p> : null}
                <Button
                  type="button"
                  onClick={() => void saveProfile()}
                  disabled={
                    profileBusy || photoBusy || (typeof image === "string" && image.startsWith("blob:"))
                  }
                  className="inline-flex items-center gap-2"
                >
                  {profileBusy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {t("settings.saving")}
                    </>
                  ) : (
                    t("settings.saveProfile")
                  )}
                </Button>
              </>
            )}
          </section>
        )}

        {section === "security" && (
          <section className="bg-card space-y-4 rounded-2xl border p-5 shadow-sm">
            <h2 className="text-base font-semibold">{t("settings.sectionSecurity")}</h2>
            {!hasPassword ? (
              <p className="text-muted-foreground text-sm">{t("settings.oauthNoPassword")}</p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="old">{t("settings.oldPassword")}</Label>
                  <Input id="old" type="password" autoComplete="current-password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="np">{t("settings.newPassword")}</Label>
                  <Input id="np" type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cp">{t("settings.confirmPassword")}</Label>
                  <Input id="cp" type="password" autoComplete="new-password" value={cfPw} onChange={(e) => setCfPw(e.target.value)} />
                </div>
                {pwMsg ? <p className="text-muted-foreground text-sm">{pwMsg}</p> : null}
                <Button type="button" onClick={() => void submitPassword()} disabled={pwBusy}>
                  {t("settings.changePassword")}
                </Button>
              </>
            )}
            <AppLockSettingsSection />
            <Separator />
            <div className="space-y-2">
              <Button type="button" variant="secondary" onClick={() => void revokeAll()}>
                {t("settings.revokeSessions")}
              </Button>
              <p className="text-muted-foreground text-xs">{t("settings.revokeSessionsHint")}</p>
            </div>
          </section>
        )}

        {section === "notifications" && !preferences && (
          <section className="bg-card rounded-2xl border p-5 shadow-sm">
            <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
          </section>
        )}

        {section === "notifications" && preferences && (
          <section className="bg-card space-y-4 rounded-2xl border p-5 shadow-sm">
            <h2 className="text-base font-semibold">{t("settings.sectionNotifications")}</h2>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{t("settings.pushToggle")}</p>
                <p className="text-muted-foreground text-xs">{t("settings.pushHint")}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={preferences.pushNotificationsEnabled ? "true" : "false"}
                aria-label={t("settings.pushToggle")}
                onClick={() => void togglePush(!preferences.pushNotificationsEnabled)}
                className={cn(
                  "relative h-7 w-12 rounded-full transition-colors",
                  preferences.pushNotificationsEnabled ? "bg-primary" : "bg-muted-foreground/30"
                )}
              >
                <span className={switchKnob(preferences.pushNotificationsEnabled)} />
              </button>
            </div>
            <div className="space-y-2">
              <Label>{t("settings.notificationSound")}</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="notif-sound" className="sr-only">
                  {t("settings.notificationSound")}
                </Label>
                <select
                  id="notif-sound"
                  className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                  value={preferences.notificationSound}
                  onChange={(e) => void setSound(e.target.value as NotificationSoundId)}
                >
                  {soundOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => playNotificationSoundPreview(preferences.notificationSound)}
                >
                  {t("settings.playSound")}
                </Button>
              </div>
            </div>
          </section>
        )}

        {section === "appearance" && !preferences && (
          <section className="bg-card rounded-2xl border p-5 shadow-sm">
            <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
          </section>
        )}

        {section === "appearance" && preferences && (
          <section className="bg-card space-y-4 rounded-2xl border p-5 shadow-sm">
            <h2 className="text-base font-semibold">{t("settings.sectionAppearance")}</h2>
            <div className="space-y-2">
              <Label>{t("settings.appearance")}</Label>
              <div className="flex flex-wrap gap-2">
                {themes.map((th) => (
                  <Button
                    key={th.id}
                    type="button"
                    size="sm"
                    variant={theme === th.id ? "default" : "outline"}
                    onClick={() => setTheme(th.id)}
                  >
                    {th.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("settings.wallpaper")}</Label>
              <p className="text-muted-foreground text-xs">{t("settings.wallpaperHint")}</p>
              <p className="text-muted-foreground text-xs font-medium">{t("settings.wallpaperPresets")}</p>
              <div className="flex flex-wrap gap-2">
                {PRESET_WALLPAPERS.map((hex) => (
                  <button
                    key={hex || "default"}
                    type="button"
                    title={hex || "default"}
                    onClick={() => void setWallpaper(hex)}
                    className={cn(
                      "size-9 rounded-full border-2 shadow-sm",
                      preferences.chatWallpaper === hex ? "border-primary ring-2 ring-primary/30" : "border-transparent"
                    )}
                    style={hex ? { backgroundColor: hex } : { background: "linear-gradient(135deg,#64748b,#0f172a)" }}
                  />
                ))}
              </div>
              <Input
                placeholder="#1e293b or https://… or /api/files/…"
                value={preferences.chatWallpaper}
                onChange={(e) => optimisticPreferences({ chatWallpaper: e.target.value })}
                onBlur={(e) => void setWallpaper(e.target.value)}
              />
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>{t("settings.language")}</Label>
              <div className="flex flex-wrap gap-2">
                {(["en", "fr", "ar"] as const).map((loc) => (
                  <Button
                    key={loc}
                    type="button"
                    size="sm"
                    variant={locale === loc ? "default" : "outline"}
                    onClick={() => setLocale(loc)}
                  >
                    {loc.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>
          </section>
        )}

        {section === "privacy" && !preferences && (
          <section className="bg-card rounded-2xl border p-5 shadow-sm">
            <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
          </section>
        )}

        {section === "privacy" && preferences && (
          <section className="bg-card space-y-4 rounded-2xl border p-5 shadow-sm">
            <h2 className="text-base font-semibold">{t("settings.sectionPrivacy")}</h2>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{t("settings.readReceipts")}</p>
                <p className="text-muted-foreground text-xs">{t("settings.readReceiptsHint")}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={preferences.readReceiptsEnabled ? "true" : "false"}
                aria-label={t("settings.readReceipts")}
                onClick={() => void toggleRead(!preferences.readReceiptsEnabled)}
                className={cn(
                  "relative h-7 w-12 rounded-full transition-colors",
                  preferences.readReceiptsEnabled ? "bg-primary" : "bg-muted-foreground/30"
                )}
              >
                <span className={switchKnob(preferences.readReceiptsEnabled)} />
              </button>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{t("settings.onlineStatus")}</p>
                <p className="text-muted-foreground text-xs">{t("settings.onlineStatusHint")}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={preferences.showOnlineStatus ? "true" : "false"}
                aria-label={t("settings.onlineStatus")}
                onClick={() => void toggleOnline(!preferences.showOnlineStatus)}
                className={cn(
                  "relative h-7 w-12 rounded-full transition-colors",
                  preferences.showOnlineStatus ? "bg-primary" : "bg-muted-foreground/30"
                )}
              >
                <span className={switchKnob(preferences.showOnlineStatus)} />
              </button>
            </div>
            <Separator />
            <h3 className="text-sm font-semibold">{t("settings.blockedUsers")}</h3>
            {blockedBusy ? (
              <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
            ) : blocked.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("settings.blockedEmpty")}</p>
            ) : (
              <ul className="divide-y rounded-xl border">
                {blocked.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{u.name || u.email}</span>
                      {u.name ? <span className="text-muted-foreground"> · {u.email}</span> : null}
                    </span>
                    <Button type="button" size="sm" variant="outline" onClick={() => void unblock(u.id)}>
                      {t("settings.unblock")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {section === "account" && (
          <section className="bg-card space-y-4 rounded-2xl border border-destructive/30 p-5 shadow-sm">
            <h2 className="text-destructive text-base font-semibold">{t("settings.sectionAccount")}</h2>
            <p className="text-muted-foreground text-sm">{t("settings.deleteWarning")}</p>
            <Button type="button" variant="destructive" onClick={() => { setDeletePhrase(""); setDeleteErr(null); setDeleteOpen(true); }}>
              {t("settings.deleteAccount")}
            </Button>
          </section>
        )}

        <section className="text-muted-foreground px-1 text-xs">
          <p>{t("settings.aboutBody")}</p>
        </section>
      </main>

      {deleteOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="alertdialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDeleteOpen(false);
          }}
        >
          <div className="bg-card w-full max-w-md rounded-xl border p-4 shadow-lg" onMouseDown={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold">{t("settings.deleteAccount")}</h2>
            <p className="text-muted-foreground mt-2 text-sm">{t("settings.deleteWarning")}</p>
            <Label className="mt-3 block text-sm" htmlFor="delc">
              {t("settings.deleteConfirmLabel")}
            </Label>
            <Input id="delc" className="mt-1" value={deletePhrase} onChange={(e) => setDeletePhrase(e.target.value)} autoComplete="off" />
            {deleteErr ? <p className="text-destructive mt-2 text-sm">{deleteErr}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleteBusy}>
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deleteBusy || deletePhrase.trim() !== "DELETE MY ACCOUNT"}
                onClick={() => void deleteAccount()}
              >
                {t("settings.deleteConfirmAction")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
