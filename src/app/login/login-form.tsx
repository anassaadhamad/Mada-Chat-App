"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useI18n } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { postLoginPath } from "@/lib/auth-callback-path";

type OAuthFlags = { github: boolean; google: boolean };

export function LoginForm({ oAuth }: { oAuth: OAuthFlags }) {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const callbackUrl = postLoginPath(searchParams.get("callbackUrl"));
  const justRegistered = searchParams.get("registered") === "1";
  const suspendedRedirect = searchParams.get("suspended") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl,
      });
      if (res?.error) {
        setError(t("login.error"));
        return;
      }
      // Stay on the current host (127.0.0.1 vs localhost); Auth.js may return an absolute URL from AUTH_URL.
      window.location.assign(callbackUrl);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-md border-0 bg-transparent text-slate-100 shadow-none">
      <CardHeader>
        <CardTitle className="text-xl text-white">{t("login.title")}</CardTitle>
        <CardDescription className="text-slate-400">{t("login.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {justRegistered ? (
          <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-50">
            {t("login.registered")}
          </p>
        ) : null}
        {suspendedRedirect ? (
          <p className="rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-50">
            {t("login.suspendedNotice")}
          </p>
        ) : null}
        {(oAuth.github || oAuth.google) && (
          <div className="flex flex-col gap-2">
            {oAuth.github && (
              <Button
                type="button"
                variant="outline"
                className="w-full border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                onClick={() => void signIn("github", { callbackUrl })}
              >
                {t("login.github")}
              </Button>
            )}
            {oAuth.google && (
              <Button
                type="button"
                variant="outline"
                className="w-full border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                onClick={() => void signIn("google", { callbackUrl })}
              >
                {t("login.google")}
              </Button>
            )}
            <p className="text-center text-xs text-slate-500">{t("login.or")}</p>
          </div>
        )}
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-slate-300">
              {t("login.email")}
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-white/15 bg-white/5 text-white placeholder:text-slate-500"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-slate-300">
              {t("login.password")}
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-white/15 bg-white/5 text-white placeholder:text-slate-500"
            />
          </div>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? t("login.submitting") : t("login.submit")}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex justify-center border-t border-white/10 pt-6">
        <p className="text-sm text-slate-400">
          {t("login.noAccount")}{" "}
          <Link href="/register" className="font-medium text-white underline-offset-4 hover:underline">
            {t("login.registerLink")}
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
