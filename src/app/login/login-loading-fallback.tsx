"use client";

import { useI18n } from "@/components/i18n/i18n-provider";

export function LoginLoadingFallback() {
  const { t } = useI18n();
  return <div className="text-muted-foreground text-sm">{t("common.loading")}</div>;
}
