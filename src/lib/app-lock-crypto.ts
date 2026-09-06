import type { AppLockStored } from "@/lib/app-lock-config";

export const APP_LOCK_PASSCODE_LEN = 4;

export const APP_LOCK_PBKDF2_ITERATIONS = 120_000;

export function isValidPasscodeFormat(value: string): boolean {
  return /^\d{4}$/.test(value);
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)!;
  return out;
}

export function randomSalt(): Uint8Array {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return salt;
}

export async function hashPasscode(passcode: string, salt: Uint8Array): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passcode), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: APP_LOCK_PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

export async function buildStoredPasscode(passcode: string): Promise<AppLockStored> {
  const salt = randomSalt();
  const hash = await hashPasscode(passcode, salt);
  return {
    v: 1,
    saltB64: bytesToB64(salt),
    hashB64: bytesToB64(hash),
    iterations: APP_LOCK_PBKDF2_ITERATIONS,
    webAuthnCredentialIdB64: null,
  };
}

export async function verifyPasscode(passcode: string, stored: AppLockStored): Promise<boolean> {
  if (!isValidPasscodeFormat(passcode)) return false;
  try {
    const salt = b64ToBytes(stored.saltB64);
    const expected = b64ToBytes(stored.hashB64);
    const actual = await hashPasscode(passcode, salt);
    if (expected.length !== actual.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected[i]! ^ actual[i]!;
    return diff === 0;
  } catch {
    return false;
  }
}
