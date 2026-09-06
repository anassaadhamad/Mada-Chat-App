"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { publicApiUrl } from "@/lib/env-public";
import { buildAiClientClockPayload } from "@/lib/ai-client-clock";
import { useI18n } from "@/components/i18n/i18n-provider";

export type AiAgentUiMode = "off" | "suggested" | "autopilot";

type AiControlCenterDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string | null;
  sendDisabled?: boolean;
  onSuggestedDraft?: (payload: { text: string; directive: string }) => void;
};

export function AiControlCenterDialog({
  open,
  onOpenChange,
  conversationId,
  sendDisabled = false,
  onSuggestedDraft,
}: AiControlCenterDialogProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<AiAgentUiMode>("off");
  const [directive, setDirective] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    if (!conversationId) return;
    try {
      const res = await fetch(
        publicApiUrl(`/api/conversations/${encodeURIComponent(conversationId)}/ai-agent/settings`)
      );
      const data = (await res.json()) as { mode?: string; directive?: string };
      if (!res.ok) return;
      if (data.mode === "suggested" || data.mode === "autopilot" || data.mode === "off") {
        setMode(data.mode);
      } else {
        setMode("off");
      }
      setDirective(typeof data.directive === "string" ? data.directive : "");
    } catch {
      /* ignore */
    }
  }, [conversationId]);

  useEffect(() => {
    if (!open || !conversationId) return;
    void loadSettings();
  }, [open, conversationId, loadSettings]);

  const saveSettings = async () => {
    if (!conversationId || busy || sendDisabled) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        publicApiUrl(`/api/conversations/${encodeURIComponent(conversationId)}/ai-agent/settings`),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, directive }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? t("aiAgent.saveFailed"));
        return;
      }
    } catch {
      setError(t("aiAgent.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const generateDraft = async () => {
    if (!conversationId || busy || sendDisabled) return;
    const d = directive.trim();
    if (!d) {
      setError(t("aiAgent.directiveRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        publicApiUrl(`/api/conversations/${encodeURIComponent(conversationId)}/ai-agent/suggest`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ directive: d, clientClock: buildAiClientClockPayload() }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string; text?: string };
      if (!res.ok) {
        setError(data.error ?? t("aiAgent.suggestFailed"));
        return;
      }
      const text = typeof data.text === "string" ? data.text : "";
      if (!text.trim()) {
        setError(t("aiAgent.emptySuggest"));
        return;
      }
      onSuggestedDraft?.({ text, directive: d });
      onOpenChange(false);
    } catch {
      setError(t("aiAgent.suggestFailed"));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[220] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-agent-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        aria-label={t("common.cancel")}
        onClick={() => onOpenChange(false)}
      />
      <div className="border-border bg-background text-foreground relative z-10 flex max-h-[min(92dvh,620px)] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-2xl border p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="bg-primary/15 text-primary flex size-9 items-center justify-center rounded-xl">
              <Sparkles className="size-5" aria-hidden />
            </span>
            <div>
              <h2 id="ai-agent-title" className="text-base font-semibold">
                {t("aiAgent.title")}
              </h2>
              <p className="text-muted-foreground text-xs">{t("aiAgent.subtitleModes")}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => onOpenChange(false)}
            aria-label={t("common.cancel")}
          >
            <X className="size-5" />
          </Button>
        </div>

        <fieldset className="space-y-2 border-0 p-0">
          <legend className="mb-1 text-sm font-medium">{t("aiAgent.modeLabel")}</legend>
          <div className="flex flex-col gap-2">
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="radio" name="ai-mode" className="mt-1" checked={mode === "off"} onChange={() => setMode("off")} disabled={busy} />
              <span>{t("aiAgent.modeOff")}</span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name="ai-mode"
                className="mt-1"
                checked={mode === "suggested"}
                onChange={() => setMode("suggested")}
                disabled={busy}
              />
              <span>{t("aiAgent.modeSuggested")}</span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name="ai-mode"
                className="mt-1"
                checked={mode === "autopilot"}
                onChange={() => setMode("autopilot")}
                disabled={busy}
              />
              <span>{t("aiAgent.modeAutopilot")}</span>
            </label>
          </div>
        </fieldset>

        <div className="flex min-h-0 flex-col gap-2">
          <Label htmlFor="ai-directive">{t("aiAgent.directiveLabel")}</Label>
          <Textarea
            id="ai-directive"
            value={directive}
            onChange={(e) => setDirective(e.target.value)}
            placeholder={t("aiAgent.directivePlaceholder")}
            rows={5}
            disabled={busy}
            className="min-h-[120px] resize-y"
          />
        </div>

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void saveSettings()} disabled={busy || sendDisabled}>
            {busy ? t("aiAgent.saving") : t("aiAgent.saveSettings")}
          </Button>
          {mode === "suggested" ? (
            <Button type="button" onClick={() => void generateDraft()} disabled={busy || sendDisabled || !directive.trim()}>
              {busy ? t("aiAgent.generating") : t("aiAgent.generateDraft")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
