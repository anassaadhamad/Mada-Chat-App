export function initialsFromLabel(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * Display initials for the current user avatar: first two letters of a single word,
 * or first letter of the first two words ("Anas Hamad" → "AH").
 * Falls back to email local-part, then "?".
 */
export function initialsFromUserName(name: string | null | undefined, email?: string | null): string {
  const n = (name ?? "").trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) {
      const w = parts[0]!;
      return w.length >= 2 ? w.slice(0, 2).toUpperCase() : `${w[0]!}`.toUpperCase();
    }
    return `${parts[0]![0]!}${parts[1]![0]!}`.toUpperCase();
  }
  const e = (email ?? "").trim();
  if (e.includes("@")) {
    const local = e.split("@")[0] ?? "";
    const clean = local.replace(/[^a-zA-Z0-9]/g, "");
    if (clean.length >= 2) return clean.slice(0, 2).toUpperCase();
    if (clean.length === 1) return `${clean[0]!}`.toUpperCase();
  }
  return "?";
}
