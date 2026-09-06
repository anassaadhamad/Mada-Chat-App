export type AppLockStored = {
  v: 1;
  saltB64: string;
  hashB64: string;
  iterations: number;
  /** Base64url-encoded credential `rawId` when biometrics are registered. */
  webAuthnCredentialIdB64?: string | null;
};

const CONFIG_PREFIX = "secret-chat-app-lock-config:";
const SESSION_LOCKED_PREFIX = "secret-chat-app-lock-active:";

export function lockConfigKey(userId: string): string {
  return `${CONFIG_PREFIX}${userId}`;
}

export function sessionLockedKey(userId: string): string {
  return `${SESSION_LOCKED_PREFIX}${userId}`;
}

export function readLockConfig(userId: string): AppLockStored | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(lockConfigKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    if (o.v !== 1) return null;
    if (typeof o.saltB64 !== "string" || typeof o.hashB64 !== "string") return null;
    if (typeof o.iterations !== "number" || !Number.isFinite(o.iterations)) return null;
    const webAuthnCredentialIdB64 =
      o.webAuthnCredentialIdB64 === undefined || o.webAuthnCredentialIdB64 === null
        ? null
        : typeof o.webAuthnCredentialIdB64 === "string"
          ? o.webAuthnCredentialIdB64
          : null;
    return {
      v: 1,
      saltB64: o.saltB64,
      hashB64: o.hashB64,
      iterations: o.iterations,
      webAuthnCredentialIdB64,
    };
  } catch {
    return null;
  }
}

export function writeLockConfig(userId: string, data: AppLockStored): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(lockConfigKey(userId), JSON.stringify(data));
}

export function clearLockConfig(userId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(lockConfigKey(userId));
}

export function readSessionLocked(userId: string): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(sessionLockedKey(userId)) === "1";
}

export function writeSessionLocked(userId: string, locked: boolean): void {
  if (typeof window === "undefined") return;
  const k = sessionLockedKey(userId);
  if (locked) window.sessionStorage.setItem(k, "1");
  else window.sessionStorage.removeItem(k);
}
