/** Label for date separators between messages (e.g. Today, Yesterday). */
export function formatChatDayLabel(
  ts: number,
  locale: string,
  t: (key: string) => string
): string {
  const d = new Date(ts);
  const now = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const sd = start(d);
  const sn = start(now);
  const diff = Math.round((sn - sd) / 86400000);

  if (diff === 0) return t("messageList.today");
  if (diff === 1) return t("messageList.yesterday");
  return d.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
