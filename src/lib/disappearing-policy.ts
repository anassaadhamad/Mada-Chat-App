/** Allowed disappearing-message TTLs (seconds). 0 = off. */
export const DISAPPEARING_TTL_OPTIONS = [0, 5, 60, 3600, 86400] as const;

export type DisappearingTtlSeconds = (typeof DISAPPEARING_TTL_OPTIONS)[number];

export function isAllowedDisappearingTtlSec(n: number): n is DisappearingTtlSeconds {
  return (DISAPPEARING_TTL_OPTIONS as readonly number[]).includes(n);
}

/** Normalizes API body: null/0/invalid → null (off); otherwise one of the allowed positive values. */
export function normalizeDisappearingSecondsInput(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return isAllowedDisappearingTtlSec(n) ? n : null;
}

/** Strict parse for PATCH: rejects unknown numeric values (returns null only for off). */
export function parseDisappearingPatchSeconds(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) throw new Error("Invalid disappearing timer");
  if (n === 0) return null;
  if (!isAllowedDisappearingTtlSec(n)) throw new Error("Invalid disappearing timer");
  return n;
}
