import axios from "axios";

export function describeUploadError(
  e: unknown,
  labels: { cancelled: string; generic: string }
): string {
  if (axios.isCancel(e)) return labels.cancelled;
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as { error?: string } | undefined;
    if (data?.error && typeof data.error === "string") return data.error;
    return labels.generic;
  }
  return labels.generic;
}
