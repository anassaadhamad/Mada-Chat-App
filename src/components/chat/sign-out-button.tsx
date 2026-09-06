"use client";

import { signOut } from "next-auth/react";
import { useI18n } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import { postAuthRedirectUrl } from "@/lib/auth-callback-path";
import { cn } from "@/lib/utils";

type SignOutButtonProps = { className?: string };

export function SignOutButton({ className }: SignOutButtonProps) {
  const { t } = useI18n();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(className)}
      onClick={() => void signOut({ callbackUrl: postAuthRedirectUrl("/") })}
    >
      {t("chat.signOut")}
    </Button>
  );
}
