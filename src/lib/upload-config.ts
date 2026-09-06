import {
  envPublicUploadClientTimeoutMs,
  envPublicUploadDefaultMaxBytes,
  envPublicUploadMaxBytesCap,
} from "@/lib/env-public";

function parseClientUploadMaxBytesFromEnv(raw: string | undefined): number {
  const parsed = raw != null && String(raw).trim() !== "" ? Number(raw) : NaN;
  const base =
    Number.isFinite(parsed) && parsed > 0 ? parsed : envPublicUploadDefaultMaxBytes();
  return Math.min(base, envPublicUploadMaxBytesCap());
}

/** Client-side max (uses public env when set, else default). */
export function getClientUploadMaxBytes(): number {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_UPLOAD_MAX_BYTES) {
    return parseClientUploadMaxBytesFromEnv(process.env.NEXT_PUBLIC_UPLOAD_MAX_BYTES);
  }
  return envPublicUploadDefaultMaxBytes();
}

/** Axios: `0` = no timeout (multi-GB uploads on slow links). */
export function getUploadClientTimeoutMs(): number {
  return envPublicUploadClientTimeoutMs();
}
