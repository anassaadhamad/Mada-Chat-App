"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAppLock } from "@/components/preferences/app-lock-provider";
import { useI18n } from "@/components/i18n/i18n-provider";
import { isValidPasscodeFormat } from "@/lib/app-lock-crypto";
import { envPublicAppLockTimeoutMs } from "@/lib/env-public";

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "").slice(0, 4);
}

export function AppLockSettingsSection() {
  const { t } = useI18n();
  const al = useAppLock();
  const timeoutMin = useMemo(() => Math.max(1, Math.round(envPublicAppLockTimeoutMs() / 60_000)), []);

  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newPin2, setNewPin2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);

  async function onEnable() {
    setMsg(null);
    const a = digitsOnly(pin);
    const b = digitsOnly(pin2);
    if (a !== b) {
      setMsg(t("appLock.mismatch"));
      return;
    }
    if (!isValidPasscodeFormat(a)) {
      setMsg(t("appLock.invalidLength"));
      return;
    }
    setBusy(true);
    try {
      await al.setupAppLock(a);
      setPin("");
      setPin2("");
      setMsg(t("appLock.enabled"));
    } catch {
      setMsg(t("settings.errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function onChangePasscode() {
    setMsg(null);
    const o = digitsOnly(oldPin);
    const n = digitsOnly(newPin);
    const n2 = digitsOnly(newPin2);
    if (n !== n2) {
      setMsg(t("appLock.mismatch"));
      return;
    }
    if (!isValidPasscodeFormat(n)) {
      setMsg(t("appLock.invalidLength"));
      return;
    }
    setBusy(true);
    try {
      const r = await al.changePasscode(o, n);
      if (!r.ok) setMsg(t("appLock.changeFailed"));
      else {
        setOldPin("");
        setNewPin("");
        setNewPin2("");
        setMsg(t("appLock.enabled"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function onRegisterBio() {
    setMsg(null);
    setBioBusy(true);
    try {
      const ok = await al.registerBiometric();
      setMsg(ok ? t("appLock.enabled") : t("appLock.bioFailed"));
    } finally {
      setBioBusy(false);
    }
  }

  function onRemoveBio() {
    al.removeBiometric();
    setMsg(t("appLock.bioRemoved"));
  }

  function onDisable() {
    if (!window.confirm(t("appLock.disableConfirm"))) return;
    al.disableAppLock();
    setPin("");
    setPin2("");
    setOldPin("");
    setNewPin("");
    setNewPin2("");
    setMsg(t("appLock.disabled"));
  }

  return (
    <>
      <Separator />
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">{t("appLock.settingsTitle")}</h3>
          <p className="text-muted-foreground mt-1 text-xs">{t("appLock.settingsHint")}</p>
          <p className="text-muted-foreground mt-2 text-xs">{t("appLock.timeoutHint", { minutes: timeoutMin })}</p>
        </div>

        {!al.hasAppLock ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="app-lock-pin">{t("appLock.passcodeLabel")}</Label>
              <Input
                id="app-lock-pin"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(digitsOnly(e.target.value))}
                placeholder="••••"
                className="max-w-xs tracking-widest"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="app-lock-pin2">{t("appLock.passcodeConfirm")}</Label>
              <Input
                id="app-lock-pin2"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={4}
                value={pin2}
                onChange={(e) => setPin2(digitsOnly(e.target.value))}
                placeholder="••••"
                className="max-w-xs tracking-widest"
              />
            </div>
            <Button type="button" onClick={() => void onEnable()} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {t("appLock.enabling")}
                </>
              ) : (
                t("appLock.enable")
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => al.lockNow()}>
                {t("appLock.lockNow")}
              </Button>
              <Button type="button" variant="outline" onClick={onDisable}>
                {t("appLock.disable")}
              </Button>
            </div>

            <div className="space-y-3 rounded-xl border p-4">
              <p className="text-sm font-medium">{t("appLock.changePasscode")}</p>
              <div className="space-y-2">
                <Label htmlFor="app-lock-old">{t("appLock.currentPasscode")}</Label>
                <Input
                  id="app-lock-old"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={oldPin}
                  onChange={(e) => setOldPin(digitsOnly(e.target.value))}
                  className="max-w-xs tracking-widest"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="app-lock-new">{t("appLock.newPasscode")}</Label>
                <Input
                  id="app-lock-new"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={newPin}
                  onChange={(e) => setNewPin(digitsOnly(e.target.value))}
                  className="max-w-xs tracking-widest"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="app-lock-new2">{t("appLock.passcodeConfirm")}</Label>
                <Input
                  id="app-lock-new2"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={newPin2}
                  onChange={(e) => setNewPin2(digitsOnly(e.target.value))}
                  className="max-w-xs tracking-widest"
                />
              </div>
              <Button type="button" variant="outline" onClick={() => void onChangePasscode()} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : t("appLock.changePasscode")}
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {al.biometricRegistered ? (
                <Button type="button" variant="outline" onClick={onRemoveBio}>
                  {t("appLock.removeBiometric")}
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={() => void onRegisterBio()} disabled={bioBusy}>
                  {bioBusy ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      {t("appLock.registeringBio")}
                    </>
                  ) : (
                    t("appLock.registerBiometric")
                  )}
                </Button>
              )}
            </div>
          </div>
        )}

        {msg ? <p className="text-muted-foreground text-sm">{msg}</p> : null}
      </div>
    </>
  );
}
