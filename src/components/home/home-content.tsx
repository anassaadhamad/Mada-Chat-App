"use client";

import Link from "next/link";
import { MessageCircle, Settings, Shield, Sparkles } from "lucide-react";
import { Playfair_Display } from "next/font/google";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n/i18n-provider";
import { cn } from "@/lib/utils";

const madaWordmark = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

type HomeContentProps = {
  isLoggedIn: boolean;
};

export function HomeContent({ isLoggedIn }: HomeContentProps) {
  const { t, dir } = useI18n();

  const features = [
    { key: "realtime", icon: MessageCircle, label: t("home.featureRealtime") },
    { key: "private", icon: Shield, label: t("home.featurePrivate") },
    { key: "clarity", icon: Sparkles, label: t("home.featureClarity") },
  ] as const;

  return (
    <div
      dir={dir}
      className="relative flex min-h-[100dvh] flex-1 flex-col overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 text-white"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 90% 55% at 50% -10%, rgba(148, 163, 184, 0.2), transparent 52%), radial-gradient(ellipse 55% 45% at 100% 40%, rgba(99, 102, 241, 0.1), transparent 50%), radial-gradient(ellipse 50% 40% at 0% 85%, rgba(56, 189, 248, 0.08), transparent 48%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 backdrop-blur-[2px]" aria-hidden />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 py-16 sm:px-8 sm:py-20">
        <div className="flex w-full max-w-3xl flex-col items-center text-center">
          <p className="text-white/45 mb-5 max-w-md text-[11px] font-medium uppercase tracking-[0.28em] sm:text-xs">
            {t("home.heroEyebrow")}
          </p>

          <h1
            className={cn(
              madaWordmark.className,
              "bg-gradient-to-b from-white via-white to-white/72 bg-clip-text text-6xl font-semibold tracking-[0.1em] text-transparent drop-shadow-[0_0_40px_rgba(255,255,255,0.1)] sm:text-7xl md:text-8xl"
            )}
          >
            {t("home.title")}
          </h1>

          <p className="text-white/65 mt-8 max-w-lg text-base leading-relaxed sm:text-lg md:mt-10">
            {t("home.subtitle")}
          </p>

          <ul className="mt-12 grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            {features.map(({ key, icon: Icon, label }) => (
              <li
                key={key}
                className="border-white/10 bg-white/[0.04] flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-start text-sm text-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md sm:flex-col sm:items-start sm:py-4"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] ring-1 ring-white/10">
                  <Icon className="size-4 text-white/70" aria-hidden />
                </span>
                <span className="font-medium tracking-tight">{label}</span>
              </li>
            ))}
          </ul>

          <div className="border-white/12 bg-white/[0.07] mt-12 w-full max-w-md rounded-2xl border p-2 shadow-[0_16px_48px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:mt-14">
            <div className="flex flex-col items-stretch gap-2 p-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-3">
              {isLoggedIn ? (
                <>
                  <Button
                    asChild
                    className="h-11 rounded-xl bg-white text-slate-950 shadow-sm hover:bg-white/90"
                  >
                    <Link href="/chat">{t("home.openChat")}</Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 shrink-0 rounded-xl border-white/25 bg-white/[0.06] text-white hover:bg-white/10"
                    aria-label={t("home.settings")}
                  >
                    <Link href="/settings">
                      <Settings className="size-4" />
                    </Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    asChild
                    className="h-11 flex-1 rounded-xl bg-white text-slate-950 shadow-sm hover:bg-white/90 sm:flex-none sm:min-w-[8.5rem]"
                  >
                    <Link href="/login">{t("home.signIn")}</Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="h-11 flex-1 rounded-xl border-white/25 bg-white/[0.06] text-white hover:bg-white/10 sm:flex-none sm:min-w-[8.5rem]"
                  >
                    <Link href="/register">{t("home.register")}</Link>
                  </Button>
                  <Button
                    asChild
                    variant="ghost"
                    className="h-10 text-white/55 hover:bg-white/[0.06] hover:text-white/80"
                  >
                    <Link href="/settings">{t("home.settings")}</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
