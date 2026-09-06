import { formatFileSize } from "@/lib/format-file-size";

/** Bytes per second → e.g. "1.2 MB/s" */
export function formatTransferSpeed(bps: number): string {
  if (!Number.isFinite(bps) || bps < 0) return "";
  if (bps < 1024) return `${Math.round(bps)} B/s`;
  const kbps = bps / 1024;
  if (kbps < 1024) return `${kbps < 10 ? kbps.toFixed(1) : Math.round(kbps)} KB/s`;
  const mbps = kbps / 1024;
  return `${mbps < 10 ? mbps.toFixed(1) : Math.round(mbps)} MB/s`;
}

export function formatBytesAndSpeed(totalBytes: number, speedBps: number): string {
  const size = formatFileSize(totalBytes);
  const spd = formatTransferSpeed(speedBps);
  if (!size) return spd;
  if (!spd) return size;
  return `${size} · ${spd}`;
}
