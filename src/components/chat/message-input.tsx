"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import type { EmojiClickData } from "emoji-picker-react";
import { EmojiStyle, Theme } from "emoji-picker-react";
import { Bot, ChevronsDown, ChevronsUp, Images, Loader2, Mic, Paperclip, Pencil, Plus, SendHorizontal, Smile, Square, Trash2, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TwemojiText } from "@/components/chat/twemoji-text";
import { RecordingVisualizer } from "@/components/chat/recording-visualizer";
import { VoiceNotePlayer } from "@/components/chat/voice-note-player";
import { useI18n } from "@/components/i18n/i18n-provider";
import { cn } from "@/lib/utils";
import { buildVoiceMediaRecorderOptions, canRecordVoice, pickVoiceRecordingFormat } from "@/lib/voice-recorder";
import { renderVoiceFileWithEffect, type VoiceEffectId } from "@/lib/voice-note-effects";
import { formatFileSize } from "@/lib/format-file-size";
import { getClientUploadMaxBytes } from "@/lib/upload-config";
import { validateClientFileBeforeUpload } from "@/lib/upload-validation";
import { playVoiceRecordStartSound, playVoiceRecordStopSound } from "@/lib/ui-sounds";

const SLIDE_LOCK_PX = 56;

const VOICE_FX_OPTIONS: { id: VoiceEffectId; Icon: LucideIcon }[] = [
  { id: "none", Icon: Mic },
  { id: "chipmunk", Icon: ChevronsUp },
  { id: "deep", Icon: ChevronsDown },
  { id: "robot", Icon: Bot },
];

const VOICE_FX_LABEL_KEY: Record<VoiceEffectId, string> = {
  none: "voice.effectNone",
  chipmunk: "voice.effectChipmunk",
  deep: "voice.effectDeep",
  robot: "voice.effectRobot",
};

function formatRecDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function EmojiPickerLoading() {
  const { t } = useI18n();
  return (
    <div className="text-muted-foreground flex h-[320px] w-[320px] items-center justify-center text-xs">
      {t("messageInput.loadingEmoji")}
    </div>
  );
}

const EmojiPicker = dynamic(() => import("emoji-picker-react").then((m) => m.default), {
  ssr: false,
  loading: () => <EmojiPickerLoading />,
});

export type AttachmentDraftUi = {
  previewUrl: string;
  fileName: string;
  /** Inline preview in the composer strip. */
  previewKind: "image" | "video" | "file" | "audio";
};

type MessageInputProps = {
  value: string;
  onChange: (value: string) => void;
  onTypingActivity?: () => void;
  onTypingEnd?: () => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  replyPreview?: { title: string; excerpt: string } | null;
  onCancelReply?: () => void;
  attachmentDraft?: AttachmentDraftUi | null;
  onClearAttachment?: () => void;
  onPickFiles?: (files: File[]) => void;
  /** After preview, sends the voice file (parent should attach + upload + send). */
  onVoiceConfirm?: (file: File) => void;
  uploadBusy?: boolean;
  /** When set, composer is editing an existing message (caption/text only). */
  editingMeta?: { hasFile: boolean } | null;
  onCancelEdit?: () => void;
  composerNotice?: string | null;
  activeUploadStrip?: {
    progress: number;
    subtitle?: string;
    onCancel?: () => void;
  } | null;
};

export function MessageInput({
  value,
  onChange,
  onTypingActivity,
  onTypingEnd,
  onSend,
  disabled,
  placeholder,
  replyPreview,
  onCancelReply,
  attachmentDraft,
  onClearAttachment,
  onPickFiles,
  onVoiceConfirm,
  uploadBusy,
  editingMeta,
  onCancelEdit,
  composerNotice,
  activeUploadStrip,
}: MessageInputProps) {
  const { t } = useI18n();
  const resolvedPlaceholder = placeholder ?? t("messageInput.placeholder");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const galleryMediaRef = useRef<HTMLInputElement>(null);
  const attachmentsMenuRef = useRef<HTMLDivElement>(null);
  const emojiWrapRef = useRef<HTMLDivElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiDark, setEmojiDark] = useState(false);
  const [attachmentsMenuOpen, setAttachmentsMenuOpen] = useState(false);
  const [pendingMediaPreview, setPendingMediaPreview] = useState<{ file: File; url: string } | null>(null);
  const [mediaPickError, setMediaPickError] = useState<string | null>(null);
  const pendingMediaUnmountRef = useRef<{ file: File; url: string } | null>(null);

  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceLocked, setVoiceLocked] = useState(false);
  const [vizStream, setVizStream] = useState<MediaStream | null>(null);
  const [voicePreview, setVoicePreview] = useState<{ file: File; url: string } | null>(null);
  const [voiceSecs, setVoiceSecs] = useState(0);
  const [voiceFxId, setVoiceFxId] = useState<VoiceEffectId>("none");
  const [voiceFxBusy, setVoiceFxBusy] = useState(false);
  const rawVoiceFileRef = useRef<File | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<BlobPart[]>([]);
  const voiceTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceStartedAtRef = useRef(0);
  const micPointerDownRef = useRef(false);
  const micPointerStartYRef = useRef(0);
  const voicePreviewUnmountRef = useRef<{ file: File; url: string } | null>(null);

  const stopVoiceTick = useCallback(() => {
    if (voiceTickRef.current) {
      clearInterval(voiceTickRef.current);
      voiceTickRef.current = null;
    }
  }, []);

  const abortVoiceRecording = useCallback(() => {
    micPointerDownRef.current = false;
    stopVoiceTick();
    const mr = voiceRecorderRef.current;
    const wasRecording = mr && mr.state === "recording";
    if (mr && mr.state !== "inactive") {
      mr.ondataavailable = null;
      mr.onstop = null;
      try {
        mr.stop();
      } catch {
        /* ignore */
      }
    }
    if (wasRecording) {
      playVoiceRecordStopSound();
    }
    voiceRecorderRef.current = null;
    voiceChunksRef.current = [];
    voiceStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    voiceStreamRef.current = null;
    setVizStream(null);
    setVoiceLocked(false);
    setVoiceRecording(false);
    setVoiceSecs(0);
  }, [stopVoiceTick]);

  useLayoutEffect(() => {
    voicePreviewUnmountRef.current = voicePreview;
  }, [voicePreview]);

  useEffect(() => {
    return () => {
      const p = voicePreviewUnmountRef.current;
      if (p?.url.startsWith("blob:")) URL.revokeObjectURL(p.url);
    };
  }, []);

  useLayoutEffect(() => {
    pendingMediaUnmountRef.current = pendingMediaPreview;
  }, [pendingMediaPreview]);

  useEffect(() => {
    return () => {
      const p = pendingMediaUnmountRef.current;
      if (p?.url.startsWith("blob:")) URL.revokeObjectURL(p.url);
    };
  }, []);

  useEffect(() => {
    if (!attachmentsMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const el = e.target;
      if (!(el instanceof Node)) return;
      if (attachmentsMenuRef.current?.contains(el)) return;
      setAttachmentsMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc, true);
    return () => document.removeEventListener("mousedown", onDoc, true);
  }, [attachmentsMenuOpen]);

  const isUploading = !!uploadBusy;

  const discardVoicePreview = useCallback(() => {
    rawVoiceFileRef.current = null;
    setVoiceFxId("none");
    setVoiceFxBusy(false);
    setVoicePreview((prev) => {
      if (prev?.url.startsWith("blob:")) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  const sendVoicePreview = useCallback(() => {
    if (!voicePreview || !onVoiceConfirm) return;
    const { file, url } = voicePreview;
    rawVoiceFileRef.current = null;
    setVoiceFxId("none");
    setVoicePreview(null);
    queueMicrotask(() => {
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    });
    onVoiceConfirm(file);
  }, [voicePreview, onVoiceConfirm]);

  const applyVoiceFx = useCallback(
    async (next: VoiceEffectId) => {
      const raw = rawVoiceFileRef.current;
      if (!raw || voiceFxBusy) return;
      if (next === voiceFxId) return;
      setVoiceFxBusy(true);
      try {
        const nextFile = await renderVoiceFileWithEffect(raw, next);
        setVoiceFxId(next);
        setVoicePreview((prev) => {
          if (prev?.url.startsWith("blob:")) URL.revokeObjectURL(prev.url);
          return { file: nextFile, url: URL.createObjectURL(nextFile) };
        });
      } catch {
        /* keep previous preview */
      } finally {
        setVoiceFxBusy(false);
      }
    },
    [voiceFxBusy, voiceFxId]
  );

  useEffect(() => {
    return () => {
      stopVoiceTick();
      const mr = voiceRecorderRef.current;
      if (mr && mr.state !== "inactive") {
        try {
          mr.stop();
        } catch {
          /* ignore */
        }
      }
      voiceStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, [stopVoiceTick]);

  const finalizeVoiceRecordingToPreview = useCallback(() => {
    const mr = voiceRecorderRef.current;
    if (!mr || mr.state === "inactive") {
      abortVoiceRecording();
      return;
    }
    const elapsedSec = (Date.now() - voiceStartedAtRef.current) / 1000;
    micPointerDownRef.current = false;
    stopVoiceTick();
    mr.onstop = () => {
      playVoiceRecordStopSound();
      voiceStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      voiceStreamRef.current = null;
      voiceRecorderRef.current = null;
      const blob = new Blob(voiceChunksRef.current, { type: mr.mimeType || "audio/webm" });
      voiceChunksRef.current = [];
      setVizStream(null);
      setVoiceLocked(false);
      setVoiceRecording(false);
      setVoiceSecs(0);
      if (elapsedSec < 0.45) {
        return;
      }
      let ext = pickVoiceRecordingFormat().fileExtension;
      const mt = blob.type || mr.mimeType || "";
      if (mt.includes("mp4")) ext = ".m4a";
      else if (mt.includes("ogg")) ext = ".ogg";
      else if (mt.includes("webm")) ext = ".weba";
      const name = `voice-${Date.now()}${ext}`;
      const file = new File([blob], name, { type: blob.type || mt || "audio/webm" });
      const url = URL.createObjectURL(file);
      rawVoiceFileRef.current = file;
      setVoiceFxId("none");
      setVoicePreview({ file, url });
    };
    try {
      mr.stop();
    } catch {
      abortVoiceRecording();
    }
  }, [abortVoiceRecording, stopVoiceTick]);

  const startVoiceRecording = useCallback(async () => {
    if (!onVoiceConfirm || disabled || isUploading || voiceRecording || voicePreview || editingMeta)
      return;
    if (!canRecordVoice() || !navigator.mediaDevices?.getUserMedia) return;
    onTypingEnd?.();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceStreamRef.current = stream;
      setVizStream(stream);
      voiceChunksRef.current = [];
      const mr = new MediaRecorder(stream, buildVoiceMediaRecorderOptions());
      voiceRecorderRef.current = mr;
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) voiceChunksRef.current.push(e.data);
      };
      mr.start(250);
      voiceStartedAtRef.current = Date.now();
      setVoiceSecs(0);
      setVoiceRecording(true);
      playVoiceRecordStartSound();
      voiceTickRef.current = setInterval(() => {
        setVoiceSecs(Math.floor((Date.now() - voiceStartedAtRef.current) / 1000));
      }, 400);
    } catch {
      abortVoiceRecording();
    }
  }, [
    onVoiceConfirm,
    disabled,
    isUploading,
    voiceRecording,
    voicePreview,
    abortVoiceRecording,
    onTypingEnd,
    editingMeta,
  ]);

  const onMicPointerDown = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      if (!onVoiceConfirm || disabled || isUploading || voiceRecording || voicePreview || editingMeta)
        return;
      micPointerDownRef.current = true;
      micPointerStartYRef.current = e.clientY;
      e.currentTarget.setPointerCapture(e.pointerId);
      void startVoiceRecording();
    },
    [disabled, onVoiceConfirm, startVoiceRecording, isUploading, voicePreview, voiceRecording, editingMeta]
  );

  const onMicPointerMove = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      if (!voiceRecording || voiceLocked || !micPointerDownRef.current) return;
      if (micPointerStartYRef.current - e.clientY > SLIDE_LOCK_PX) {
        setVoiceLocked(true);
      }
    },
    [voiceLocked, voiceRecording]
  );

  const onMicPointerUp = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      micPointerDownRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      if (!voiceRecording || voiceLocked) return;
      if (voiceRecorderRef.current?.state !== "recording") return;
      finalizeVoiceRecordingToPreview();
    },
    [finalizeVoiceRecordingToPreview, voiceLocked, voiceRecording]
  );

  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setEmojiDark(el.classList.contains("dark"));
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!emojiOpen) return;
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (emojiWrapRef.current && !emojiWrapRef.current.contains(t)) {
        setEmojiOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [emojiOpen]);

  const closeAttachmentsMenuIfHasText = useCallback((draft: string) => {
    if (!draft.trim()) return;
    setAttachmentsMenuOpen((prev) => (prev ? false : prev));
  }, []);

  const openFilePicker = useCallback((input: HTMLInputElement | null) => {
    if (!input) return;
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    try {
      pickerInput.showPicker?.();
      return;
    } catch {
      // showPicker may throw on unsupported browsers or restricted contexts.
    }
    input.click();
  }, []);

  const insertAtCursor = useCallback(
    (text: string) => {
      const el = taRef.current;
      if (!el) {
        const next = value + text;
        onChange(next);
        closeAttachmentsMenuIfHasText(next);
        return;
      }
      const start = el.selectionStart ?? value.length;
      const end = el.selectionEnd ?? value.length;
      const next = value.slice(0, start) + text + value.slice(end);
      onChange(next);
      closeAttachmentsMenuIfHasText(next);
      queueMicrotask(() => {
        el.focus();
        const pos = start + text.length;
        el.setSelectionRange(pos, pos);
      });
    },
    [value, onChange, closeAttachmentsMenuIfHasText]
  );

  const onEmojiSelect = useCallback(
    (data: EmojiClickData) => {
      insertAtCursor(data.emoji);
      onTypingActivity?.();
    },
    [insertAtCursor, onTypingActivity]
  );

  const clearPendingMediaPreview = useCallback(() => {
    setMediaPickError(null);
    setPendingMediaPreview((prev) => {
      if (prev?.url.startsWith("blob:")) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  const handleMediaFileChosen = useCallback(
    (list: FileList | null) => {
      const f = list?.[0];
      if (!f || !onPickFiles) return;
      const maxBytes = getClientUploadMaxBytes();
      const gate = validateClientFileBeforeUpload(f, maxBytes);
      if (gate === "tooLarge") {
        setMediaPickError(t("upload.clientTooLarge", { size: formatFileSize(maxBytes) }));
        setAttachmentsMenuOpen(false);
        return;
      }
      if (gate === "badType") {
        setMediaPickError(t("upload.clientBadType"));
        setAttachmentsMenuOpen(false);
        return;
      }
      setMediaPickError(null);
      setAttachmentsMenuOpen(false);
      setPendingMediaPreview((prev) => {
        if (prev?.url.startsWith("blob:")) URL.revokeObjectURL(prev.url);
        return { file: f, url: URL.createObjectURL(f) };
      });
    },
    [onPickFiles, t]
  );

  const confirmPendingMediaToDraft = useCallback(() => {
    if (!pendingMediaPreview || !onPickFiles || isUploading) return;
    const { file } = pendingMediaPreview;
    clearPendingMediaPreview();
    queueMicrotask(() => {
      onPickFiles([file]);
    });
  }, [pendingMediaPreview, onPickFiles, isUploading, clearPendingMediaPreview]);

  const canSend =
    !disabled &&
    !isUploading &&
    !voiceRecording &&
    !voicePreview &&
    !pendingMediaPreview &&
    (editingMeta
      ? value.trim().length > 0 || editingMeta.hasFile
      : !!value.trim() || !!attachmentDraft);

  const submit = useCallback(() => {
    if (!canSend) return;
    onSend();
  }, [canSend, onSend]);

  const hasTypedText = value.trim().length > 0;
  const showPlusMenu =
    !!onPickFiles &&
    !hasTypedText &&
    !editingMeta &&
    !attachmentDraft &&
    !voicePreview &&
    !voiceRecording &&
    !pendingMediaPreview;
  const plusMenuDisabled = disabled || isUploading;
  const showMicButton =
    !!onVoiceConfirm &&
    canRecordVoice() &&
    !voiceRecording &&
    !editingMeta &&
    !hasTypedText &&
    !attachmentDraft &&
    !pendingMediaPreview &&
    !voicePreview;
  const showSendSlot = hasTypedText || !!attachmentDraft || !!editingMeta;

  return (
    <div className="border-chat-header-border bg-chat-composer/95 supports-backdrop-filter:bg-chat-composer/90 relative min-w-0 w-full border-t px-3 py-3 backdrop-blur md:px-4 xl:px-6">
      {composerNotice ? (
        <div className="border-destructive/40 bg-destructive/10 text-destructive chat-thread-content-width mb-2 rounded-lg border px-3 py-2 text-center text-xs font-medium">
          {composerNotice}
        </div>
      ) : null}
      {activeUploadStrip ? (
        <div className="border-chat-header-border bg-muted/40 chat-thread-content-width mb-2 rounded-lg border px-3 py-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-[11px] font-medium">{t("upload.uploading")}</span>
            <span className="text-foreground text-[11px] font-semibold tabular-nums">
              {activeUploadStrip.progress}%
            </span>
          </div>
          <div className="bg-muted mb-2 h-1.5 w-full overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full transition-[width] duration-150 ease-out"
              style={{ width: `${Math.min(100, Math.max(0, activeUploadStrip.progress))}%` }}
            />
          </div>
          {activeUploadStrip.subtitle ? (
            <p className="text-muted-foreground mb-2 text-[10px]">{activeUploadStrip.subtitle}</p>
          ) : null}
          {activeUploadStrip.onCancel ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 w-full text-xs"
              onClick={activeUploadStrip.onCancel}
            >
              {t("upload.cancel")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {editingMeta ? (
        <div className="chat-thread-content-width mb-2 flex items-center gap-2 rounded-lg border border-amber-600/25 bg-amber-50/90 px-3 py-2 dark:border-amber-500/30 dark:bg-amber-950/50">
          <Pencil className="text-amber-800 size-4 shrink-0 dark:text-amber-200" aria-hidden />
          <p className="text-amber-950 min-w-0 flex-1 text-xs font-medium dark:text-amber-100">
            {t("messageInput.editingMode")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 border-amber-700/30 text-xs dark:border-amber-400/35"
            onClick={onCancelEdit}
            disabled={isUploading}
          >
            {t("messageInput.cancelEdit")}
          </Button>
        </div>
      ) : null}
      {replyPreview ? (
        <div className="chat-thread-content-width mb-2 flex items-stretch gap-2 rounded-lg border border-emerald-700/20 bg-emerald-50/80 pr-1 pl-3 dark:border-emerald-500/20 dark:bg-emerald-950/40">
          <div className="min-w-0 flex-1 border-l-4 border-emerald-600 py-2 dark:border-emerald-400">
            <p className="text-emerald-800 dark:text-emerald-200 text-xs font-semibold">{replyPreview.title}</p>
            <TwemojiText
              text={replyPreview.excerpt}
              className="text-muted-foreground block truncate text-xs"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 self-center"
            aria-label={t("messageInput.cancelReplyAria")}
            onClick={onCancelReply}
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : null}

      {voicePreview ? (
        <div
          className={cn(
            "chat-thread-content-width mb-2 flex flex-col gap-3 rounded-2xl border px-4 py-4 shadow-lg",
            "border-white/15 bg-gradient-to-b from-white/14 to-white/[0.06] backdrop-blur-xl",
            "dark:border-white/10 dark:from-white/12 dark:to-black/35",
            "text-foreground"
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold tracking-tight">{t("voice.previewTitle")}</p>
              <p className="text-muted-foreground mt-0.5 max-w-md text-[10px] leading-snug">{t("voice.effectsHint")}</p>
            </div>
            {voiceFxBusy ? (
              <div className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-medium">
                <Loader2 className="size-3.5 animate-spin shrink-0" aria-hidden />
                <span className="sr-only">{t("common.loading")}</span>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label={t("voice.effectsLabel")}>
            {VOICE_FX_OPTIONS.map(({ id, Icon }) => {
              const active = id === voiceFxId;
              const label = t(VOICE_FX_LABEL_KEY[id]);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => void applyVoiceFx(id)}
                  disabled={voiceFxBusy || isUploading}
                  aria-label={t("voice.effectAria", { label })}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-all backdrop-blur-md",
                    "border-border/50 bg-background/45 hover:bg-background/60",
                    "disabled:pointer-events-none disabled:opacity-50",
                    active &&
                      "border-emerald-500/50 bg-emerald-500/15 text-emerald-900 ring-1 ring-emerald-500/25 dark:text-emerald-50"
                  )}
                >
                  <Icon className="size-4 shrink-0 opacity-90" aria-hidden />
                  {label}
                </button>
              );
            })}
          </div>

          <VoiceNotePlayer
            key={voicePreview.url}
            src={voicePreview.url}
            playbackId="voice-draft-preview"
            isOwn
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 border-border/60 bg-background/50 backdrop-blur-sm hover:bg-background/70"
              onClick={discardVoicePreview}
              disabled={isUploading || voiceFxBusy}
            >
              <Trash2 className="size-3.5" />
              {t("voice.previewDelete")}
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1.5 bg-emerald-600/90 text-white shadow-sm backdrop-blur-sm hover:bg-emerald-500/90"
              onClick={sendVoicePreview}
              disabled={isUploading || voiceFxBusy}
            >
              <SendHorizontal className="size-3.5" />
              {t("voice.previewSend")}
            </Button>
          </div>
        </div>
      ) : null}

      {voiceRecording ? (
        <div className="border-destructive/30 bg-destructive/[0.07] chat-thread-content-width mb-2 flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2">
          <RecordingVisualizer stream={vizStream} className="max-w-[160px] shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-destructive flex items-center gap-1.5 text-xs font-semibold tabular-nums">
              <span className="inline-block size-2 animate-pulse rounded-full bg-red-500" />
              {formatRecDuration(voiceSecs)}
            </p>
            <p className="text-muted-foreground mt-1 text-[10px] leading-snug">
              {voiceLocked ? t("voice.lockedHint") : t("voice.slideToLockHint")}
            </p>
            {!voiceLocked ? (
              <p className="text-muted-foreground text-[10px] leading-snug">{t("voice.releaseToPreviewHint")}</p>
            ) : (
              <p className="text-muted-foreground text-[10px] leading-snug">{t("voice.tapStopHint")}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="size-10 shrink-0"
              aria-label={t("voice.stop")}
              onClick={finalizeVoiceRecordingToPreview}
            >
              <Square className="size-4 fill-current" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-10 shrink-0"
              aria-label={t("voice.cancel")}
              onClick={abortVoiceRecording}
            >
              <X className="size-5" />
            </Button>
          </div>
        </div>
      ) : null}

      {attachmentDraft ? (
        <div className="chat-thread-content-width mb-2 flex items-center gap-3 rounded-lg border bg-muted/50 px-3 py-2">
          <div className="bg-background relative size-14 shrink-0 overflow-hidden rounded-md border">
            {attachmentDraft.previewKind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={attachmentDraft.previewUrl}
                alt=""
                className="size-full object-cover"
              />
            ) : attachmentDraft.previewKind === "video" ? (
              <video
                src={attachmentDraft.previewUrl}
                muted
                playsInline
                preload="metadata"
                className="size-full object-cover"
              />
            ) : attachmentDraft.previewKind === "audio" ? (
              <div className="text-muted-foreground flex size-full flex-col items-center justify-center gap-0.5 text-[10px]">
                <Mic className="size-5 opacity-80" aria-hidden />
                <span className="font-medium">{t("voice.draftLabel")}</span>
              </div>
            ) : (
              <div className="text-muted-foreground flex size-full items-center justify-center text-[10px]">
                {t("common.file")}
              </div>
            )}
          </div>
          <p className="min-w-0 flex-1 truncate text-xs font-medium">{attachmentDraft.fileName}</p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label={t("messageInput.removeAttachmentAria")}
            onClick={onClearAttachment}
            disabled={isUploading}
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : null}

      <div className="relative chat-thread-content-width">
        {pendingMediaPreview ? (
          <div
            className="pointer-events-auto absolute inset-x-0 bottom-full z-[65] mb-2 flex justify-center px-0"
            role="dialog"
            aria-modal="true"
            aria-labelledby="media-preview-title"
          >
            <div className="bg-card/95 text-card-foreground supports-backdrop-filter:bg-card/90 w-full max-w-lg rounded-xl border p-3 shadow-xl ring-1 ring-black/5 backdrop-blur-md dark:ring-white/10">
              <p id="media-preview-title" className="mb-2 text-center text-sm font-semibold">
                {t("messageInput.mediaPreviewTitle")}
              </p>
              <div className="bg-muted/30 relative max-h-[min(50vh,20rem)] overflow-hidden rounded-lg border">
                {pendingMediaPreview.file.type.startsWith("video/") ? (
                  <video
                    src={pendingMediaPreview.url}
                    controls
                    muted
                    playsInline
                    preload="metadata"
                    className="max-h-[min(50vh,20rem)] w-full object-contain"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={pendingMediaPreview.url}
                    alt=""
                    className="max-h-[min(50vh,20rem)] w-full object-contain"
                  />
                )}
              </div>
              <p className="text-muted-foreground mt-1.5 truncate text-center text-xs">
                {pendingMediaPreview.file.name}
              </p>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearPendingMediaPreview}
                  disabled={isUploading}
                >
                  {t("messageInput.mediaPreviewCancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={confirmPendingMediaToDraft}
                  disabled={isUploading || !onPickFiles}
                >
                  {t("messageInput.mediaPreviewAdd")}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
        {mediaPickError && !pendingMediaPreview ? (
          <p className="text-destructive mb-2 text-center text-xs font-medium">{mediaPickError}</p>
        ) : null}

        <div className="flex min-w-0 items-end gap-3">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept="image/*,video/*,application/pdf,.txt,.zip,.doc,.docx,.xls,.xlsx"
            onChange={(e) => {
              const list = e.target.files;
              if (list?.length && onPickFiles) {
                onPickFiles(Array.from(list));
              }
              e.target.value = "";
            }}
          />

          {showPlusMenu ? (
            <div ref={attachmentsMenuRef} className="relative shrink-0 self-end">
              {/* `sr-only` avoids display:none so programmatic open works reliably on mobile */}
              <input
                ref={galleryMediaRef}
                type="file"
                className="sr-only"
                accept="image/*,video/*"
                aria-label={t("messageInput.mediaMenuGallery")}
                onChange={(e) => {
                  handleMediaFileChosen(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground size-11 shrink-0 rounded-full"
                aria-label={t("messageInput.plusAria")}
                aria-expanded={attachmentsMenuOpen}
                aria-haspopup="menu"
                disabled={plusMenuDisabled}
                onClick={() => {
                  if (plusMenuDisabled) return;
                  setMediaPickError(null);
                  setAttachmentsMenuOpen((o) => !o);
                }}
              >
                <Plus className="size-5" strokeWidth={2.25} />
              </Button>
              {attachmentsMenuOpen ? (
                <div
                  className="bg-popover text-popover-foreground absolute bottom-full start-0 z-[55] mb-2 min-w-[15rem] overflow-hidden rounded-xl border p-1 shadow-md"
                  role="menu"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="hover:bg-accent flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-start text-sm"
                    onClick={() => {
                      setAttachmentsMenuOpen(false);
                      fileRef.current?.click();
                    }}
                  >
                    <Paperclip className="text-muted-foreground size-4 shrink-0" aria-hidden />
                    {t("messageInput.attachAria")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="hover:bg-accent flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-start text-sm"
                    onClick={() => {
                      openFilePicker(galleryMediaRef.current);
                      setAttachmentsMenuOpen(false);
                    }}
                  >
                    <Images className="text-muted-foreground size-4 shrink-0" aria-hidden />
                    {t("messageInput.mediaMenuGallery")}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div ref={emojiWrapRef} className="relative shrink-0 self-end">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground size-11 rounded-full"
              aria-label={t("messageInput.emojiAria")}
              aria-expanded={emojiOpen}
              disabled={
                disabled || isUploading || voiceRecording || !!voicePreview || !!editingMeta || !!pendingMediaPreview
              }
              onClick={() => setEmojiOpen((v) => !v)}
            >
              <Smile className="size-5" />
            </Button>
            {emojiOpen ? (
              <div className="absolute bottom-full start-0 z-50 mb-2 shadow-lg">
                <EmojiPicker
                  emojiStyle={EmojiStyle.TWITTER}
                  theme={emojiDark ? Theme.DARK : Theme.LIGHT}
                  width={320}
                  height={360}
                  onEmojiClick={(d) => {
                    onEmojiSelect(d);
                  }}
                />
              </div>
            ) : null}
          </div>

          <Textarea
            ref={taRef}
            value={value}
            onChange={(e) => {
              const next = e.target.value;
              onChange(next);
              closeAttachmentsMenuIfHasText(next);
              onTypingActivity?.();
            }}
            placeholder={resolvedPlaceholder}
            disabled={disabled || isUploading || voiceRecording || !!voicePreview}
            rows={1}
            className="min-h-[44px] max-h-40 flex-1 resize-none rounded-2xl py-3"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            onBlur={() => onTypingEnd?.()}
          />

          {showMicButton ? (
            <button
              type="button"
              className={cn(
                "text-muted-foreground hover:text-foreground flex size-11 shrink-0 touch-none cursor-pointer items-center justify-center rounded-full self-end select-none",
                "hover:bg-accent focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                (disabled || isUploading || !!voicePreview) && "pointer-events-none opacity-40"
              )}
              aria-label={t("voice.record")}
              aria-disabled={disabled || isUploading || !!voicePreview}
              tabIndex={disabled || isUploading || !!voicePreview ? -1 : 0}
              onPointerDown={onMicPointerDown}
              onPointerMove={onMicPointerMove}
              onPointerUp={onMicPointerUp}
              onPointerCancel={onMicPointerUp}
            >
              <Mic className="size-5" />
            </button>
          ) : null}

          {showSendSlot ? (
            <Button
              type="button"
              size="icon"
              className="h-11 w-11 shrink-0 self-end rounded-full"
              disabled={!canSend}
              onClick={submit}
              aria-label={t("messageInput.sendAria")}
            >
              <SendHorizontal className={cn("size-4", isUploading && "animate-pulse")} />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
