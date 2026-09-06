"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n/i18n-provider";

export default function ErrorBoundaryPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="bg-background flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="max-w-md space-y-2">
        <h1 className="text-foreground text-lg font-semibold tracking-tight">{t("errors.boundaryTitle")}</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">{t("errors.boundaryHint")}</p>
      </div>
      <Button type="button" onClick={() => reset()}>
        {t("errors.tryAgain")}
      </Button>
    </div>
  );
}
