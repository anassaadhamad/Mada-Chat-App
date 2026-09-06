/** Encoded `lastMessagePreview` for disappearing-timer system rows (sidebar decodes + i18n). */
export const DISAPPEARING_TIMER_PREVIEW_PREFIX = "!SYS!dm:";

export function encodeDisappearingTimerPreview(seconds: number | null): string {
  return seconds == null ? `${DISAPPEARING_TIMER_PREVIEW_PREFIX}off` : `${DISAPPEARING_TIMER_PREVIEW_PREFIX}${seconds}`;
}

/** `undefined` = not a disappearing-timer preview token. */
export function parseDisappearingTimerPreview(preview: string): number | null | undefined {
  const s = preview.trim();
  if (!s.startsWith(DISAPPEARING_TIMER_PREVIEW_PREFIX)) return undefined;
  const rest = s.slice(DISAPPEARING_TIMER_PREVIEW_PREFIX.length);
  if (rest === "off") return null;
  const n = Number(rest);
  return Number.isFinite(n) ? n : undefined;
}
