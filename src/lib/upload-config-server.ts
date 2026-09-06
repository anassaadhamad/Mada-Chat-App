import {
  envUploadDefaultMaxBytes,
  envUploadMaxBytesCap,
} from "@/lib/env-server";

/** Server-only: parse `UPLOAD_MAX_BYTES` with defaults and cap from env. */
export function parseUploadMaxBytesFromEnv(raw: string | undefined): number {
  const parsed = raw != null && String(raw).trim() !== "" ? Number(raw) : NaN;
  const base =
    Number.isFinite(parsed) && parsed > 0 ? parsed : envUploadDefaultMaxBytes();
  return Math.min(base, envUploadMaxBytesCap());
}
