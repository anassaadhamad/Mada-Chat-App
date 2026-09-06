"use client";

import { cn } from "@/lib/utils";
import { initialsFromUserName } from "@/lib/initials";

export type UserAvatarProps = {
  /** Display name for initials when there is no image */
  name?: string | null;
  email?: string | null;
  /** NextAuth / profile `image` URL */
  image?: string | null;
  /** Alias for external APIs that use `avatarUrl` */
  avatarUrl?: string | null;
  className?: string;
  /** Pixel size (width & height); default 40 */
  size?: number;
  /** Tint for the initials plate */
  variant?: "default" | "muted" | "header";
};

function resolveSrc(image?: string | null, avatarUrl?: string | null): string | null {
  const a = (image ?? "").trim();
  if (a) return a;
  const b = (avatarUrl ?? "").trim();
  return b || null;
}

export function UserAvatar({
  name,
  email,
  image,
  avatarUrl,
  className,
  size = 40,
  variant = "default",
}: UserAvatarProps) {
  const src = resolveSrc(image, avatarUrl);
  const initials = initialsFromUserName(name, email);
  const dim = { width: size, height: size, minWidth: size, minHeight: size };

  const plate =
    variant === "header"
      ? "bg-white/15 text-white ring-2 ring-white/20"
      : variant === "muted"
        ? "bg-muted text-muted-foreground ring-2 ring-border"
        : "bg-primary text-primary-foreground ring-2 ring-primary/20";

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote /uploads URLs; sizes vary
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={cn("rounded-full object-cover", className)}
        style={dim}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full font-sans font-semibold uppercase tracking-wide antialiased",
        plate,
        className
      )}
      style={{ ...dim, fontSize: Math.max(11, Math.round(size * 0.36)) }}
      aria-hidden
    >
      {initials}
    </div>
  );
}
