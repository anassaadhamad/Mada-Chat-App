/**
 * Infer first-strong paragraph direction for short spans (e.g. spoiler text).
 * Returns null when there is no strong LTR/RTL letter (emoji-only, punctuation, empty).
 */
function isSkippableForFirstStrong(cp: number): boolean {
  if (cp <= 0x20 || cp === 0x7f) return true;
  if (cp === 0x200c || cp === 0x200d || cp === 0xfeff) return true;
  return /\s/u.test(String.fromCodePoint(cp));
}

export function inferStrongTextDirection(text: string): "ltr" | "rtl" | null {
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i)!;
    i += cp > 0xffff ? 2 : 1;

    if (isSkippableForFirstStrong(cp)) continue;

    // Hebrew, Arabic, Syriac, Arabic presentation forms (broad RTL scripts)
    if ((cp >= 0x0590 && cp <= 0x08ff) || (cp >= 0xfb1d && cp <= 0xfdff) || (cp >= 0xfe70 && cp <= 0xfeff)) {
      return "rtl";
    }

    // Latin letters (ASCII + Latin-1 supplement + extended Latin blocks used in European langs)
    if (
      (cp >= 0x41 && cp <= 0x5a) ||
      (cp >= 0x61 && cp <= 0x7a) ||
      (cp >= 0xc0 && cp <= 0x24f)
    ) {
      return "ltr";
    }
  }
  return null;
}
