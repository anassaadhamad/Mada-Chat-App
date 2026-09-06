"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Delete, Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isWebAuthnSupported } from "@/lib/webauthn-app-lock";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const;

export type VaultUnlockLabels = {
  title: string;
  subtitle: string;
  useBiometrics: string;
  biometricsUnavailable: string;
  wrongCode: string;
  keypadDelete: string;
  cancel: string;
};

type VaultUnlockPanelProps = {
  open: boolean;
  labels: VaultUnlockLabels;
  showBiometric: boolean;
  verifyPasscode: (code: string) => Promise<boolean>;
  verifyBiometric: () => Promise<boolean>;
  onVerified: () => void;
  onCancel: () => void;
};

export function VaultUnlockPanel({
  open,
  labels,
  showBiometric,
  verifyPasscode,
  verifyBiometric,
  onVerified,
  onCancel,
}: VaultUnlockPanelProps) {
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [wrongHint, setWrongHint] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
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
      const ok = await verifyPasscode(code);
      setBusy(false);
      if (ok) {
        onVerified();
        return;
      }
      setDigits("");
      setShake(true);
      setWrongHint(true);
      window.setTimeout(() => setShake(false), 500);
      window.setTimeout(() => setWrongHint(false), 2200);
    },
    [busy, onVerified, verifyPasscode]
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

  const onBio = async () => {
    setBioBusy(true);
    try {
      const ok = await verifyBiometric();
      if (ok) onVerified();
    } finally {
      setBioBusy(false);
    }
  };

  const bioSupported = showBiometric && isWebAuthnSupported();

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-4 py-8">
      <div className="w-full max-w-xs text-center">
        <h2 className="text-lg font-semibold tracking-tight">{labels.title}</h2>
        <p className="text-muted-foreground mt-2 text-sm">{labels.subtitle}</p>
      </div>

      <motion.div
        className="flex justify-center gap-3"
        aria-live="polite"
        animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : { x: 0 }}
        transition={{ duration: 0.45, ease: "easeInOut" }}
      >
        {Array.from({ length: 4 }, (_, i) => (
          <span
            key={i}
            className={cn(
              "border-input flex h-11 w-9 items-center justify-center rounded-lg border-2 text-base font-semibold tabular-nums",
              i < digits.length ? "border-primary bg-primary/5" : "bg-muted/40"
            )}
          >
            {i < digits.length ? "•" : ""}
          </span>
        ))}
      </motion.div>

      {wrongHint ? (
        <p className="text-destructive text-center text-sm font-medium">{labels.wrongCode}</p>
      ) : (
        <div className="h-5" />
      )}

      <div className="mx-auto grid max-w-[260px] grid-cols-3 gap-2.5">
        {KEYS.map((k, idx) => {
          if (k === "") return <div key={`e-${idx}`} className="min-h-11" />;
          if (k === "del") {
            return (
              <Button
                key="del"
                type="button"
                variant="outline"
                size="lg"
                className="h-11 rounded-xl"
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
              className="h-11 rounded-xl text-base font-medium"
              disabled={busy || digits.length >= 4}
              onClick={() => append(k)}
            >
              {k}
            </Button>
          );
        })}
      </div>

      <div className="flex w-full max-w-xs flex-col gap-2">
        {showBiometric ? (
          <Button
            type="button"
            variant="secondary"
            className="w-full gap-2 rounded-xl"
            disabled={!bioSupported || bioBusy || busy}
            onClick={() => void onBio()}
          >
            <Fingerprint className="size-5 shrink-0" />
            {bioSupported ? labels.useBiometrics : labels.biometricsUnavailable}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" className="rounded-xl" onClick={onCancel}>
          {labels.cancel}
        </Button>
      </div>
    </div>
  );
}

/** Full-screen dimmed overlay (e.g. when vault is shown outside slide panel). */
export function VaultUnlockOverlay({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="vault-overlay"
          className="bg-background/80 absolute inset-0 z-10 flex flex-col backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
