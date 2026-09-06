"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Delete } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { publicApiUrl } from "@/lib/env-public";
import { useI18n } from "@/components/i18n/i18n-provider";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const;

type ChatVaultPinSetupDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfigured: () => void;
};

export function ChatVaultPinSetupDialog({ open, onClose, onConfigured }: ChatVaultPinSetupDialogProps) {
  const { t } = useI18n();
  const [step, setStep] = useState<"enter" | "confirm">("enter");
  const [digits, setDigits] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const submitLock = useRef(false);

  useEffect(() => {
    if (!open) {
      setStep("enter");
      setDigits("");
      setFirstPin("");
      setBusy(false);
      setError(null);
      submitLock.current = false;
    }
  }, [open]);

  const advanceOrSubmit = useCallback(
    async (code: string) => {
      if (busy) return;
      if (step === "enter") {
        setFirstPin(code);
        setDigits("");
        setStep("confirm");
        return;
      }
      if (code !== firstPin) {
        setShake(true);
        setError(t("chat.chatVaultPinMismatch"));
        setStep("enter");
        setDigits("");
        setFirstPin("");
        window.setTimeout(() => setShake(false), 500);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(publicApiUrl("/api/me/chat-vault/setup"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: code }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? t("chat.chatVaultPinSaveError"));
          setStep("enter");
          setDigits("");
          setFirstPin("");
          return;
        }
        onConfigured();
        onClose();
      } catch {
        setError(t("chat.chatVaultPinSaveError"));
        setStep("enter");
        setDigits("");
        setFirstPin("");
      } finally {
        setBusy(false);
      }
    },
    [busy, firstPin, onClose, onConfigured, step, t]
  );

  useEffect(() => {
    if (digits.length === 4 && open && !submitLock.current) {
      submitLock.current = true;
      void advanceOrSubmit(digits).finally(() => {
        submitLock.current = false;
      });
    }
  }, [digits, open, advanceOrSubmit]);

  const append = (d: string) => {
    if (!open || busy) return;
    if (digits.length >= 4) return;
    setDigits((prev) => prev + d);
  };

  const backspace = () => {
    if (!open || busy) return;
    setDigits((prev) => prev.slice(0, -1));
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-vault-setup-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="bg-card max-h-[90vh] w-full max-w-sm overflow-auto rounded-xl border p-5 shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="chat-vault-setup-title" className="text-lg font-semibold tracking-tight">
          {step === "enter" ? t("chat.chatVaultPinSetupTitle") : t("chat.chatVaultPinConfirmTitle")}
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">
          {step === "enter" ? t("chat.chatVaultPinSetupSubtitle") : t("chat.chatVaultPinConfirmSubtitle")}
        </p>

        <motion.div
          className="mt-6 flex justify-center gap-3"
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

        {error ? (
          <p className="text-destructive mt-3 text-center text-sm font-medium">{error}</p>
        ) : (
          <div className="mt-3 h-5" />
        )}

        <div className="mx-auto mt-2 grid max-w-[260px] grid-cols-3 gap-2.5">
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
                  aria-label={t("chat.chatVaultKeypadDelete")}
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

        <div className="mt-6 flex justify-end">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}
