"use client";

import { startTransition, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { I18nProvider } from "@/components/i18n/i18n-provider";
import { SimpleToastProvider } from "@/components/ui/simple-toast";
import { AppThemeProvider } from "@/components/theme/app-theme-provider";
import { UserPreferencesProvider } from "@/components/preferences/user-preferences-context";
import { AppLockProvider } from "@/components/preferences/app-lock-provider";
import { isAppTheme, isLocale, type AppTheme, type UserPreferencesDTO } from "@/lib/user-preferences";
import type { Locale } from "@/i18n/config";
import { publicApiUrl } from "@/lib/env-public";

function isProbablyPublicPath(pathname: string | null): boolean {
  if (!pathname || pathname === "/") return true;
  if (pathname === "/login" || pathname.startsWith("/login/")) return true;
  if (pathname === "/register" || pathname.startsWith("/register/")) return true;
  return false;
}

type Boot = {
  locale?: Locale;
  theme?: AppTheme;
  preferences?: UserPreferencesDTO | null;
};

function OuterLoader() {
  return (
    <div className="bg-background text-muted-foreground flex min-h-[100dvh] items-center justify-center px-4 text-sm">
      Loading…
    </div>
  );
}

/**
 * After session is known, authenticated users wait for `/api/me/preferences` before mounting
 * theme/locale providers so DB values apply before any localStorage hydration runs.
 */
export function DeferredAppProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [ready, setReady] = useState(false);
  const [boot, setBoot] = useState<Boot | null>(null);
  const pub = isProbablyPublicPath(pathname);

  useEffect(() => {
    if (status === "loading") return;

    if (status === "unauthenticated") {
      startTransition(() => {
        setBoot(null);
        setReady(true);
      });
      return;
    }

    startTransition(() => {
      setReady(false);
    });
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(publicApiUrl("/api/me"));
        if (!res.ok) {
          if (!cancelled) {
            setBoot(null);
            setReady(true);
          }
          return;
        }
        const data = (await res.json()) as {
          preferences?: unknown;
          profile?: unknown;
        };
        if (cancelled) return;
        const prefsRaw = data.preferences as Record<string, unknown> | undefined;
        const preferences: UserPreferencesDTO | null = prefsRaw
          ? {
              theme: isAppTheme(prefsRaw.theme) ? prefsRaw.theme : "system",
              locale: isLocale(prefsRaw.locale) ? prefsRaw.locale : "en",
              pushNotificationsEnabled:
                typeof prefsRaw.pushNotificationsEnabled === "boolean"
                  ? prefsRaw.pushNotificationsEnabled
                  : true,
              notificationSound:
                typeof prefsRaw.notificationSound === "string" &&
                ["ding", "pop", "chime", "none"].includes(prefsRaw.notificationSound)
                  ? (prefsRaw.notificationSound as UserPreferencesDTO["notificationSound"])
                  : "ding",
              readReceiptsEnabled:
                typeof prefsRaw.readReceiptsEnabled === "boolean" ? prefsRaw.readReceiptsEnabled : true,
              showOnlineStatus:
                typeof prefsRaw.showOnlineStatus === "boolean" ? prefsRaw.showOnlineStatus : true,
              chatWallpaper: typeof prefsRaw.chatWallpaper === "string" ? prefsRaw.chatWallpaper : "",
            }
          : null;
        setBoot({
          locale: preferences?.locale,
          theme: preferences?.theme,
          preferences,
        });
      } catch {
        if (!cancelled) setBoot(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, session?.user?.id]);

  /**
   * Public routes render while the session is still resolving (marketing/login UX).
   * Elsewhere, wait for session so we do not paint chat/settings with guest defaults first.
   */
  if (!pub && status === "loading") {
    return <OuterLoader />;
  }

  if (status === "authenticated" && !ready) {
    return <OuterLoader />;
  }

  const userKey = session?.user?.id ?? "guest";
  const serverLocale = status === "authenticated" ? boot?.locale : undefined;
  const serverTheme = status === "authenticated" ? boot?.theme : undefined;
  const serverPrefs = status === "authenticated" ? boot?.preferences ?? null : null;

  return (
    <UserPreferencesProvider initial={serverPrefs}>
      <I18nProvider key={userKey} initialFromServer={serverLocale}>
        <SimpleToastProvider>
          <AppThemeProvider key={userKey} initialFromServer={serverTheme}>
            {status === "authenticated" && session?.user?.id ? (
              <AppLockProvider
                userId={session.user.id}
                userName={session.user?.name ?? null}
                userEmail={session.user?.email ?? null}
              >
                {children}
              </AppLockProvider>
            ) : (
              children
            )}
          </AppThemeProvider>
        </SimpleToastProvider>
      </I18nProvider>
    </UserPreferencesProvider>
  );
}
