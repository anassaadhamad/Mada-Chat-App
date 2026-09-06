"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n/i18n-provider";

const DEBOUNCE_MS = 420;

type PreviewPayload =
  | {
      kind: "rich";
      url: string;
      title: string | null;
      description: string | null;
      imageUrl: string | null;
      domain: string;
    }
  | { kind: "image"; url: string; imageUrl: string }
  | { kind: "video"; url: string; videoUrl: string };

function previewDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function LinkPreview({
  url,
  isOwn,
  fetchWhen = true,
}: {
  url: string;
  isOwn: boolean;
  /** When false (e.g. optimistic "sending"), skips network until true. */
  fetchWhen?: boolean;
}) {
  const { t } = useI18n();
  const [debouncedUrl, setDebouncedUrl] = useState(url);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedUrl(url), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [url]);

  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!fetchWhen || !debouncedUrl) {
      setLoading(false);
      setPreview(null);
      setFailed(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setPreview(null);
    setFailed(false);

    fetch(`/api/link-preview?url=${encodeURIComponent(debouncedUrl)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("bad status");
        return r.json() as Promise<{ preview: PreviewPayload | null }>;
      })
      .then((body) => {
        if (cancelled) return;
        if (body.preview) {
          setPreview(body.preview);
          setFailed(false);
        } else {
          setPreview(null);
          setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreview(null);
          setFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedUrl, fetchWhen]);

  const domain = useMemo(() => previewDomain(url), [url]);

  if (!fetchWhen) {
    return null;
  }

  const cardShell = (inner: ReactNode, href: string) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "mt-2 flex max-w-full cursor-pointer flex-col overflow-hidden rounded-xl border text-start no-underline transition-opacity hover:opacity-95",
        isOwn
          ? "border-chat-out-foreground/25 bg-black/12 dark:bg-black/20"
          : "border-chat-in-border bg-background/80 dark:bg-muted/50"
      )}
    >
      {inner}
    </a>
  );

  if (loading && !preview) {
    return (
      <div
        className={cn(
          "text-muted-foreground mt-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs",
          isOwn ? "border-chat-out-foreground/20" : "border-chat-in-border"
        )}
      >
        <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
        <span>{t("linkPreview.loading")}</span>
      </div>
    );
  }

  if (preview?.kind === "image") {
    return cardShell(
      <img
        src={preview.imageUrl}
        alt=""
        className="max-h-52 w-full object-cover"
        loading="lazy"
        decoding="async"
      />,
      preview.url
    );
  }

  if (preview?.kind === "video") {
    return cardShell(
      <video
        src={preview.videoUrl}
        className="max-h-52 w-full bg-black object-contain"
        controls
        playsInline
        preload="metadata"
      />,
      preview.url
    );
  }

  if (preview?.kind === "rich") {
    const hasImage = !!preview.imageUrl;
    return cardShell(
      <div className="flex min-w-0 flex-col">
        {hasImage ? (
          <div className="relative h-36 w-full shrink-0 bg-muted">
            <img
              src={preview.imageUrl!}
              alt=""
              className="size-full object-cover"
              loading="lazy"
              decoding="async"
            />
          </div>
        ) : null}
        <div className="min-w-0 space-y-1 p-2.5">
          {preview.title ? (
            <p
              className={cn(
                "line-clamp-2 text-sm font-semibold leading-snug",
                isOwn ? "text-chat-out-foreground" : "text-foreground"
              )}
            >
              {preview.title}
            </p>
          ) : null}
          {preview.description ? (
            <p
              className={cn(
                "line-clamp-2 text-xs leading-relaxed opacity-90",
                isOwn ? "text-chat-out-foreground/85" : "text-muted-foreground"
              )}
            >
              {preview.description}
            </p>
          ) : null}
          <p
            className={cn(
              "flex items-center gap-1 pt-0.5 text-[11px] font-medium",
              isOwn ? "text-chat-out-foreground/70" : "text-muted-foreground"
            )}
          >
            <ExternalLink className="size-3 shrink-0 opacity-80" aria-hidden />
            <span className="truncate">{preview.domain}</span>
          </p>
        </div>
      </div>,
      preview.url
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "mt-2 inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium underline-offset-2 hover:underline",
        isOwn
          ? "border-chat-out-foreground/25 text-chat-out-foreground"
          : "border-chat-in-border text-primary"
      )}
    >
      <ExternalLink className="size-3.5 shrink-0 opacity-80" aria-hidden />
      <span className="min-w-0 truncate" title={url}>
        {failed ? t("linkPreview.openLink") : domain}
      </span>
    </a>
  );
}
