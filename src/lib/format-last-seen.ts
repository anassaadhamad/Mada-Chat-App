/** Short “last seen” line for chat headers (WhatsApp-style), with i18n templates. */
export function formatLastSeen(
  ts: number | null | undefined,
  isOnline: boolean,
  locale: string,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  if (isOnline) return t("lastSeen.online");
  if (ts == null || !Number.isFinite(ts)) return "";

  const d = new Date(ts);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfToday - startOfMsg) / 86400000);

  const time = d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });

  if (diffDays === 0) return t("lastSeen.todayAt", { time });
  if (diffDays === 1) return t("lastSeen.yesterdayAt", { time });
  if (diffDays < 7) {
    const weekday = d.toLocaleDateString(locale, { weekday: "long" });
    return t("lastSeen.weekdayAt", { weekday, time });
  }
  const date = d.toLocaleDateString(locale, { month: "short", day: "numeric" });
  return t("lastSeen.dateAt", { date, time });
}
