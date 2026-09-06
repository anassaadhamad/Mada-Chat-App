"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Check, ChevronLeft, ChevronRight, Moon, Sun, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useI18n } from "@/components/i18n/i18n-provider";
import { useAppTheme, type AppTheme } from "@/components/theme/app-theme-provider";
import { localeLabels, locales } from "@/i18n/config";
import { postAuthRedirectUrl } from "@/lib/auth-callback-path";
import { cn } from "@/lib/utils";
import packageJson from "../../../package.json";

function SettingsSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="px-1">
        <h2 className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
          {title}
        </h2>
        {hint ? <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p> : null}
      </div>
      <div className="bg-card border-border overflow-hidden rounded-2xl border shadow-sm">{children}</div>
    </section>
  );
}

function RowButton({
  children,
  onClick,
  className,
  trailing,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "hover:bg-muted/80 flex w-full items-center justify-between gap-3 ps-4 pe-4 py-3.5 text-start text-sm transition-colors",
        className
      )}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {trailing}
    </button>
  );
}

function RowLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="hover:bg-muted/80 flex w-full items-center justify-between gap-3 ps-4 pe-4 py-3.5 text-start text-sm transition-colors"
    >
      <span className="min-w-0 flex-1">{children}</span>
      <ChevronRight className="text-muted-foreground size-4 shrink-0 rtl:rotate-180" />
    </Link>
  );
}

const themeIcons: Record<AppTheme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Smartphone,
};

export function MobileSettings() {
  const router = useRouter();
  const { data: session } = useSession();
  const { t, locale, setLocale } = useI18n();
  const { theme, setTheme } = useAppTheme();

  const themes: { id: AppTheme; label: string }[] = [
    { id: "light", label: t("settings.themeLight") },
    { id: "dark", label: t("settings.themeDark") },
    { id: "system", label: t("settings.themeSystem") },
  ];

  return (
    <div className="bg-muted/30 text-foreground flex min-h-[100dvh] flex-col">
      <header className="border-border bg-background/80 supports-backdrop-filter:bg-background/70 sticky top-0 z-10 border-b backdrop-blur-md pt-[max(0px,env(safe-area-inset-top))]">
        <div className="mx-auto flex h-14 max-w-lg items-center gap-1 ps-[max(0.5rem,env(safe-area-inset-left))] pe-[max(0.5rem,env(safe-area-inset-right))]">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => router.back()}
            aria-label={t("settings.back")}
          >
            <ChevronLeft className="size-5 rtl:rotate-180" />
          </Button>
          <h1 className="text-lg font-semibold tracking-tight">{t("settings.title")}</h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-8 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <SettingsSection title={t("settings.language")} hint={t("settings.languageHint")}>
          {locales.map((loc, i) => (
            <div key={loc}>
              {i > 0 ? <Separator /> : null}
              <RowButton
                onClick={() => setLocale(loc)}
                trailing={
                  locale === loc ? (
                    <Check className="text-primary size-5 shrink-0" strokeWidth={2.5} />
                  ) : (
                    <span className="size-5 shrink-0" />
                  )
                }
              >
                <span className="font-medium">{localeLabels[loc]}</span>
              </RowButton>
            </div>
          ))}
        </SettingsSection>

        <SettingsSection title={t("settings.appearance")}>
          {themes.map((item, i) => {
            const Icon = themeIcons[item.id];
            return (
              <div key={item.id}>
                {i > 0 ? <Separator /> : null}
                <RowButton
                  onClick={() => setTheme(item.id)}
                  trailing={
                    theme === item.id ? (
                      <Check className="text-primary size-5 shrink-0" strokeWidth={2.5} />
                    ) : (
                      <span className="size-5 shrink-0" />
                    )
                  }
                >
                  <span className="flex items-center gap-3">
                    <Icon className="text-muted-foreground size-4 shrink-0" />
                    <span className="font-medium">{item.label}</span>
                  </span>
                </RowButton>
              </div>
            );
          })}
        </SettingsSection>

        <SettingsSection title={t("settings.account")}>
          <RowLink href="/">{t("common.home")}</RowLink>
          {session?.user ? (
            <>
              <Separator />
              <RowLink href="/chat">{t("settings.openChat")}</RowLink>
              <Separator />
              <button
                type="button"
                className="text-destructive hover:bg-destructive/5 flex w-full items-center ps-4 pe-4 py-3.5 text-start text-sm font-medium transition-colors"
                onClick={() => void signOut({ callbackUrl: postAuthRedirectUrl("/") })}
              >
                {t("settings.signOut")}
              </button>
            </>
          ) : (
            <>
              <Separator />
              <RowLink href="/login">{t("home.signIn")}</RowLink>
            </>
          )}
        </SettingsSection>

        <SettingsSection title={t("settings.about")}>
          <div className="ps-4 pe-4 py-3.5">
            <p className="text-muted-foreground text-sm leading-relaxed">{t("settings.aboutBody")}</p>
            <p className="text-muted-foreground mt-3 text-xs">
              {t("settings.version")} {packageJson.version}
            </p>
          </div>
        </SettingsSection>
      </main>
    </div>
  );
}
