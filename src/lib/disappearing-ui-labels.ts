/** Short label for a disappearing TTL (seconds), used in system notices and menus. */
export function disappearDurationShortLabel(
  seconds: number,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  if (seconds === 5) return t("chat.disappearShort5s");
  if (seconds === 60) return t("chat.disappearShort1m");
  if (seconds === 3600) return t("chat.disappearShort1h");
  if (seconds === 86400) return t("chat.disappearShort1d");
  return t("chat.disappearShortCustom", { seconds });
}
