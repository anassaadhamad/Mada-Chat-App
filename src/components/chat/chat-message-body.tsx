"use client";

import { useMemo } from "react";
import { TwemojiText } from "@/components/chat/twemoji-text";
import { CinematicSpoiler } from "@/components/chat/cinematic-spoiler";
import { useI18n } from "@/components/i18n/i18n-provider";
import { inferStrongTextDirection } from "@/lib/infer-strong-text-direction";
import { parseSpoilerPipeSegments } from "@/lib/spoiler-segments";
import { cn } from "@/lib/utils";

type ChatMessageBodyProps = {
  content: string;
  highlightQuery?: string;
  isOwn: boolean;
  className?: string;
};

/**
 * Renders message text with optional `||spoiler||` spans wrapped in {@link CinematicSpoiler}.
 */
export function ChatMessageBody({ content, highlightQuery, isOwn, className }: ChatMessageBodyProps) {
  const { dir: uiDir } = useI18n();
  const segments = useMemo(() => parseSpoilerPipeSegments(content), [content]);

  const spoilerParagraphDir = (spoilerText: string): "ltr" | "rtl" =>
    inferStrongTextDirection(spoilerText) ?? (uiDir === "rtl" ? "rtl" : "ltr");

  const singlePlain = segments.length === 1 && segments[0].type === "plain";
  if (singlePlain) {
    return (
      <TwemojiText
        text={segments[0].text}
        className={cn("block whitespace-pre-wrap break-words", className)}
        highlightQuery={highlightQuery}
      />
    );
  }

  return (
    <span className={cn("block whitespace-pre-wrap break-words", className)}>
      {segments.map((seg, i) => {
        if (seg.type === "plain") {
          return (
            <TwemojiText
              key={i}
              text={seg.text}
              className="whitespace-pre-wrap break-words"
              highlightQuery={highlightQuery}
            />
          );
        }
        const d = spoilerParagraphDir(seg.text);
        return (
          <CinematicSpoiler key={i} variant={isOwn ? "own" : "peer"} className="mx-0.5 my-0.5" contentDir={d}>
            <TwemojiText
              text={seg.text}
              className="whitespace-pre-wrap break-words"
              highlightQuery={highlightQuery}
              dir={d}
            />
          </CinematicSpoiler>
        );
      })}
    </span>
  );
}
