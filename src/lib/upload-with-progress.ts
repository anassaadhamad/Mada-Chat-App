import { getUploadClientTimeoutMs } from "@/lib/upload-config";
import axios from "axios";

export type UploadProgressPayload = {
  progress: number;
  loaded: number;
  total: number;
  speedBps: number;
};

export type UploadResponse = {
  url: string;
  fileType: string;
  fileName: string;
  fileSize: number;
};

export async function uploadFileWithProgress(
  file: File,
  options: {
    onProgress?: (p: UploadProgressPayload) => void;
    signal?: AbortSignal;
    /** Axios timeout in ms (`0` = no limit). Defaults to upload client timeout from env. */
    timeoutMs?: number;
  }
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  let lastLoaded = 0;
  let lastT = typeof performance !== "undefined" ? performance.now() : Date.now();

  const res = await axios.post<UploadResponse>("/api/upload", formData, {
    signal: options.signal,
      timeout: options.timeoutMs ?? getUploadClientTimeoutMs(),
    onUploadProgress: (ev) => {
      const total = ev.total ?? file.size;
      const loaded = ev.loaded;
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const dt = (now - lastT) / 1000;
      let speedBps = 0;
      if (dt > 0.08) {
        speedBps = (loaded - lastLoaded) / dt;
        lastLoaded = loaded;
        lastT = now;
      }
      const progress = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
      options.onProgress?.({ progress, loaded, total, speedBps });
    },
  });

  const data = res.data;
  if (!data?.url || !data?.fileType) {
    throw new Error("Invalid upload response");
  }
  return data;
}
