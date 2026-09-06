"use client";

import { Suspense } from "react";
import { Playfair_Display } from "next/font/google";
import { LoginForm } from "./login-form";
import { LoginLoadingFallback } from "./login-loading-fallback";
import { useI18n } from "@/components/i18n/i18n-provider";

const madaWordmark = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

type OAuthFlags = { github: boolean; google: boolean };

export function LoginView({ oAuth }: { oAuth: OAuthFlags }) {
  const { t } = useI18n();

  return (
    <div className="relative flex min-h-full flex-1 flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-950 p-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 85% 55% at 50% -15%, rgba(148, 163, 184, 0.22), transparent 55%), radial-gradient(ellipse 60% 40% at 100% 50%, rgba(99, 102, 241, 0.08), transparent 50%), radial-gradient(ellipse 50% 35% at 0% 80%, rgba(56, 189, 248, 0.06), transparent 45%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 backdrop-blur-[2px]" aria-hidden />
      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-10">
        <header className="flex flex-col items-center text-center">
          <h1
            className={`${madaWordmark.className} bg-gradient-to-b from-white via-white to-white/75 bg-clip-text text-6xl font-semibold tracking-[0.12em] text-transparent drop-shadow-[0_0_48px_rgba(255,255,255,0.12)] sm:text-7xl`}
          >
            Mada
          </h1>
          <p className="text-white/50 mt-3 max-w-sm text-sm font-medium tracking-[0.2em] uppercase sm:text-[0.8125rem]">
            {t("login.brandTagline")}
          </p>
        </header>
        <div className="w-full rounded-2xl border border-white/10 bg-white/[0.06] p-1 shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <Suspense fallback={<LoginLoadingFallback />}>
            <LoginForm oAuth={oAuth} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
