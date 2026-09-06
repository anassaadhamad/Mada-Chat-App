/**
 * Client-only WebAuthn for app unlock (platform authenticator).
 * RP ID must match the site origin (localhost / deployed hostname).
 */

export function isWebAuthnSupported(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined";
}

export function getWebAuthnRpId(): string {
  if (typeof window === "undefined") return "localhost";
  return window.location.hostname;
}

function bufferToBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBuffer(s: string): ArrayBuffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)!;
  return bytes.buffer;
}

function randomChallenge(): Uint8Array {
  const c = new Uint8Array(32);
  crypto.getRandomValues(c);
  return c;
}

function randomUserHandle(): Uint8Array {
  const h = new Uint8Array(32);
  crypto.getRandomValues(h);
  return h;
}

export async function registerAppLockCredential(displayName: string): Promise<string | null> {
  if (!isWebAuthnSupported()) return null;
  const rpId = getWebAuthnRpId();
  const challenge = randomChallenge();
  const userId = randomUserHandle();

  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge: challenge as BufferSource,
    rp: { name: "Mada", id: rpId },
    user: {
      id: userId as BufferSource,
      name: "app-lock",
      displayName: displayName.slice(0, 64) || "Mada",
    },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      userVerification: "required",
      residentKey: "preferred",
    },
    timeout: 60_000,
    attestation: "none",
  };

  try {
    const cred = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
    if (!cred || cred.type !== "public-key") return null;
    return bufferToBase64url(cred.rawId);
  } catch {
    return null;
  }
}

export async function authenticateAppLockCredential(credentialIdB64: string): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  const rpId = getWebAuthnRpId();
  let rawId: ArrayBuffer;
  try {
    rawId = base64urlToBuffer(credentialIdB64);
  } catch {
    return false;
  }

  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: randomChallenge() as BufferSource,
    rpId,
    allowCredentials: [{ type: "public-key", id: rawId }],
    userVerification: "required",
    timeout: 60_000,
  };

  try {
    const cred = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
    return !!cred && cred.type === "public-key";
  } catch {
    return false;
  }
}
