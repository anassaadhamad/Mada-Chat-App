"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Fingerprint, Delete } from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isWebAuthnSupported } from "@/lib/webauthn-app-lock";
import { postAuthRedirectUrl } from "@/lib/auth-callback-path";

export type AppLockScreenLabels = {
  title: string;
  subtitle: string;
  useBiometrics: string;
  biometricsUnavailable: string;
  wrongCode: string;
  signOut: string;
  keypadDelete: string;
};

type AppLockScreenProps = {
  open: boolean;
  labels: AppLockScreenLabels;
  showBiometric: boolean;
  biometricBusy: boolean;
  onBiometric: () => void;
  onUnlockPasscode: (code: string) => Promise<boolean>;
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const;

export function AppLockScreen({
  open,
  labels,
  showBiometric,
  biometricBusy,
  onBiometric,
  onUnlockPasscode,
}: AppLockScreenProps) {
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [wrongHint, setWrongHint] = useState(false);
  const submitRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setDigits("");
      setBusy(false);
      submitRef.current = false;
      setWrongHint(false);
    }
  }, [open]);

  const trySubmit = useCallback(
    async (code: string) => {
      if (code.length !== 4 || busy) return;
      setBusy(true);
      const ok = await onUnlockPasscode(code);
      setBusy(false);
      if (!ok) {
        setDigits("");
        setShake(true);
        setWrongHint(true);
        window.setTimeout(() => setShake(false), 500);
        window.setTimeout(() => setWrongHint(false), 2200);
      }
    },
    [busy, onUnlockPasscode]
  );

  useEffect(() => {
    if (digits.length === 4 && open && !submitRef.current) {
      submitRef.current = true;
      void trySubmit(digits).finally(() => {
        submitRef.current = false;
      });
    }
  }, [digits, open, trySubmit]);

  const append = (d: string) => {
    if (!open || busy) return;
    if (digits.length >= 4) return;
    setDigits((prev) => prev + d);
  };

  const backspace = () => {
    if (!open || busy) return;
    setDigits((prev) => prev.slice(0, -1));
  };

  const bioSupported = showBiometric && isWebAuthnSupported();

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="app-lock"
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/55 px-4 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="app-lock-title"
        >
          <motion.div
            className="bg-background/95 text-foreground w-full max-w-sm rounded-3xl border p-8 shadow-2xl"
            initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 12, filter: "blur(6px)" }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mb-8 text-center">
              <h1 id="app-lock-title" className="text-xl font-semibold tracking-tight">
                {labels.title}
              </h1>
              <p className="text-muted-foreground mt-2 text-sm">{labels.subtitle}</p>
            </div>

            <motion.div
              className="mb-8 flex justify-center gap-3"
              aria-live="polite"
              animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : { x: 0 }}
              transition={{ duration: 0.45, ease: "easeInOut" }}
            >
              {Array.from({ length: 4 }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    "border-input flex h-12 w-10 items-center justify-center rounded-xl border-2 text-lg font-semibold tabular-nums",
                    i < digits.length ? "border-primary bg-primary/5" : "bg-muted/40"
                  )}
                >
                  {i < digits.length ? "•" : ""}
                </span>
              ))}
            </motion.div>
            {wrongHint ? (
              <p className="text-destructive mb-4 text-center text-sm font-medium">{labels.wrongCode}</p>
            ) : (
              <div className="mb-4 h-5" />
            )}

            <div className="mx-auto grid max-w-[280px] grid-cols-3 gap-3">
              {KEYS.map((k, idx) => {
                if (k === "") {
                  return <div key={`e-${idx}`} className="min-h-12" />;
                }
                if (k === "del") {
                  return (
                    <Button
                      key="del"
                      type="button"
                      variant="outline"
                      size="lg"
                      className="h-12 rounded-2xl"
                      disabled={busy || digits.length === 0}
                      onClick={backspace}
                      aria-label={labels.keypadDelete}
                    >
                      <Delete className="size-5" />
                    </Button>
                  );
                }
                return (
                  <Button
                    key={k}
                    type="button"
                    variant="outline"
                    size="lg"
                    className="h-12 rounded-2xl text-lg font-medium"
                    disabled={busy || digits.length >= 4}
                    onClick={() => append(k)}
                  >
                    {k}
                  </Button>
                );
              })}
            </div>

            <div className="mt-8 flex flex-col gap-3">
              {showBiometric ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full gap-2 rounded-2xl"
                  disabled={!bioSupported || biometricBusy || busy}
                  onClick={() => void onBiometric()}
                >
                  <Fingerprint className="size-5 shrink-0" />
                  {bioSupported ? labels.useBiometrics : labels.biometricsUnavailable}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                className="text-muted-foreground w-full rounded-2xl text-sm"
                onClick={() => void signOut({ callbackUrl: postAuthRedirectUrl("/login") })}
              >
                {labels.signOut}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
