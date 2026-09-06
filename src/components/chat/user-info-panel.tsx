"use client";

import { UserAvatar } from "@/components/user/user-avatar";
import { Button } from "@/components/ui/button";
import { TwemojiText } from "@/components/chat/twemoji-text";
import { cn } from "@/lib/utils";

export type UserInfoPanelProps = {
  open: boolean;
  onClose: () => void;
  name: string;
  email?: string | null;
  bio: string;
  image: string | null;
  online: boolean;
  closeLabel: string;
  bioSectionLabel: string;
  statusOnline: string;
  statusOffline: string;
  emptyBio: string;
};

export function UserInfoPanel({
  open,
  onClose,
  name,
  email,
  bio,
  image,
  online,
  closeLabel,
  bioSectionLabel,
  statusOnline,
  statusOffline,
  emptyBio,
}: UserInfoPanelProps) {
  if (!open) return null;
  const bioText = bio.trim();

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-end bg-black/45 p-0 sm:items-center sm:justify-center sm:p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-info-title"
        className="bg-background flex h-full w-full max-w-md animate-in flex-col shadow-2xl duration-200 fade-in sm:h-auto sm:max-h-[min(90vh,640px)] sm:rounded-2xl sm:border"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 id="user-info-title" className="truncate text-lg font-semibold">
            {name}
          </h2>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {closeLabel}
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto p-6 sm:max-h-[70vh]">
          <UserAvatar
            name={name}
            email={email}
            image={image}
            size={112}
            variant="muted"
            className="ring-border ring-4"
          />
          <p
            className={cn(
              "text-sm font-medium",
              online ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
            )}
          >
            {online ? statusOnline : statusOffline}
          </p>
          {email ? (
            <p className="text-muted-foreground max-w-full text-center text-xs break-all">{email}</p>
          ) : null}
          <div className="w-full max-w-full">
            <p className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-wide uppercase">
              {bioSectionLabel}
            </p>
            {bioText ? (
              <TwemojiText
                text={bio}
                className="text-foreground block whitespace-pre-wrap break-words text-sm leading-relaxed"
              />
            ) : (
              <p className="text-foreground whitespace-pre-wrap break-words text-sm leading-relaxed">{emptyBio}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
