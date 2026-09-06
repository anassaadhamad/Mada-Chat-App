"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Delete } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n/i18n-provider";
import { useSimpleToast } from "@/components/ui/simple-toast";
import { updateChatPin } from "@/lib/update-chat-pin";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const;

type Step = "current" | "new" | "confirm";

type ChatVaultChangePinDialogProps = {
  open: boolean;
  conversationId: string | null;
  onClose: () => void;
  verifyPasscode: (code: string) => Promise<boolean>;
};

export function ChatVaultChangePinDialog({
  open,
  conversationId,
  onClose,
  verifyPasscode,
}: ChatVaultChangePinDialogProps) {
  const { t } = useI18n();
  const toast = useSimpleToast();
  const [step, setStep] = useState<Step>("current");
  const [digits, setDigits] = useState("");
  const [verifiedOldPin, setVerifiedOldPin] = useState("");
  const [pendingNewPin, setPendingNewPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const submitLock = useRef(false);

  useEffect(() => {
    if (!open) {
      setStep("current");
      setDigits("");
      setVerifiedOldPin("");
      setPendingNewPin("");
      setBusy(false);
      setShake(false);
      submitLock.current = false;
    }
  }, [open]);

  const shakeOnce = useCallback(() => {
    setShake(true);
    window.setTimeout(() => setShake(false), 500);
  }, []);

  const advanceOrSubmit = useCallback(
    async (code: string) => {
      if (busy) return;
      if (step === "current") {
        setBusy(true);
        try {
          const ok = await verifyPasscode(code);
          if (!ok) {
            shakeOnce();
            toast.show(t("chat.changePinWrongCurrent"), "error");
            setDigits("");
            return;
          }
          setVerifiedOldPin(code);
          setDigits("");
          setStep("new");
        } finally {
          setBusy(false);
        }
        return;
      }
      if (step === "new") {
        setPendingNewPin(code);
        setDigits("");
        setStep("confirm");
        return;
      }
      if (code !== pendingNewPin) {
        shakeOnce();
        toast.show(t("chat.changePinMismatchToast"), "error");
        setStep("new");
        setPendingNewPin("");
        setDigits("");
        return;
      }
      setBusy(true);
      try {
        const result = await updateChatPin(conversationId, verifiedOldPin, code);
        if (!result.ok) {
          if (result.error === "wrong_pin") {
            toast.show(t("chat.changePinWrongCurrent"), "error");
            setStep("current");
            setVerifiedOldPin("");
            setPendingNewPin("");
            setDigits("");
            return;
          }
          if (result.error === "network") {
            toast.show(t("chat.changePinNetworkError"), "error");
            return;
          }
          const detail = result.detail?.toLowerCase() ?? "";
          if (detail.includes("different")) {
            toast.show(t("chat.changePinSameAsOld"), "error");
          } else {
            toast.show(t("chat.changePinSaveError"), "error");
          }
          return;
        }
        toast.show(t("chat.changePinSuccess"), "success");
        onClose();
      } finally {
        setBusy(false);
      }
    },
    [
      busy,
      conversationId,
      onClose,
      pendingNewPin,
      shakeOnce,
      step,
      t,
      toast,
      verifiedOldPin,
      verifyPasscode,
    ]
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

  const title =
    step === "current"
      ? t("chat.changePinCurrentTitle")
      : step === "new"
        ? t("chat.changePinNewTitle")
        : t("chat.changePinConfirmTitle");
  const subtitle =
    step === "current"
      ? t("chat.changePinCurrentSubtitle")
      : step === "new"
        ? t("chat.changePinNewSubtitle")
        : t("chat.changePinConfirmSubtitle");

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-vault-change-pin-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="bg-card max-h-[90vh] w-full max-w-sm overflow-auto rounded-xl border p-5 shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="chat-vault-change-pin-title" className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">{subtitle}</p>

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

        <div className="mt-3 h-5" />

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
