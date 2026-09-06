"use client";

import { useLayoutEffect, useRef } from "react";
import twemoji from "twemoji";
import { envPublicTwemojiAssetsBase } from "@/lib/env-public";
import { cn } from "@/lib/utils";
import { splitHighlightSegments } from "@/lib/chat-search";

/** Twemoji SVG set — base URL from `NEXT_PUBLIC_TWEMOJI_ASSETS_BASE`. */
const twemojiAssetsBase = envPublicTwemojiAssetsBase();

type TwemojiLeafProps = {
  text: string;
  className?: string;
  /** When set, fixes RTL/LTR for isolated runs (e.g. spoilers) instead of `dir="auto"` reflow. */
  dir?: "ltr" | "rtl" | "auto";
};

function TwemojiLeaf({ text, className, dir = "auto" }: TwemojiLeafProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.textContent = text;
    twemoji.parse(el, {
      base: twemojiAssetsBase,
      folder: "svg",
      ext: ".svg",
    });
  }, [text]);

  return <span ref={ref} dir={dir} className={cn("twemoji-leaf", className)} />;
}

type TwemojiTextProps = {
  text: string;
  className?: string;
  /** When set, matching substrings are wrapped in `<mark>` (per segment, then Twemoji-parsed). */
  highlightQuery?: string;
  dir?: "ltr" | "rtl" | "auto";
};

/**
 * Renders plain text with emoji sequences replaced by Twemoji SVG `<img>` tags so appearance is
 * identical on every OS. Use `className` for layout (`block`, `truncate`, etc.).
 */
export function TwemojiText({ text, className, highlightQuery, dir = "auto" }: TwemojiTextProps) {
  const q = highlightQuery?.trim() ?? "";
  if (!q) {
    return <TwemojiLeaf text={text} className={cn("twemoji-root", className)} dir={dir} />;
  }

  const parts = splitHighlightSegments(text, q);
  return (
    <span dir={dir} className={cn("twemoji-root", className)}>
      {parts.map((p, i) =>
        p.mark ? (
          <mark
            key={i}
            dir={dir}
            className="rounded bg-amber-200/95 px-0.5 text-inherit dark:bg-amber-500/40"
          >
            <TwemojiLeaf text={p.text} dir={dir} />
          </mark>
        ) : (
          <TwemojiLeaf key={i} text={p.text} dir={dir} />
        )
      )}
    </span>
  );
}
