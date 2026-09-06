"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { formatFileSize } from "@/lib/format-file-size";

type StoragePayload = {
  totalBytesFromRecords: number;
  messagesWithFile: number;
  uploadDirectory: { fileCount: number; totalBytes: number };
};

export default function AdminStoragePage() {
  const [data, setData] = useState<StoragePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/storage");
        if (!res.ok) {
          if (!cancelled) setError("Failed to load");
          return;
        }
        const json = (await res.json()) as StoragePayload;
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">File storage</h2>
        <p className="text-zinc-500 mt-1 max-w-2xl text-sm">
          Attachment bytes recorded on messages versus actual files on disk under{" "}
          <code className="text-violet-300">public/uploads</code>.
        </p>
      </header>

      {error ? <p className="text-red-400 text-sm">{error}</p> : null}

      {!data && !error ? <p className="text-zinc-500 text-sm">Loading…</p> : null}

      {data ? (
        <div className="grid gap-4 md:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="border-white/10 bg-zinc-900/60 rounded-2xl border p-6"
          >
            <h3 className="text-zinc-400 text-xs font-medium tracking-wide uppercase">Message metadata</h3>
            <p className="mt-3 font-mono text-2xl font-semibold">{formatFileSize(data.totalBytesFromRecords)}</p>
            <p className="text-zinc-500 mt-2 text-sm">Sum of <code>fileSize</code> on non-deleted messages</p>
            <p className="text-zinc-500 mt-1 text-xs">{data.messagesWithFile} messages with attachments</p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="border-white/10 bg-zinc-900/60 rounded-2xl border p-6"
          >
            <h3 className="text-zinc-400 text-xs font-medium tracking-wide uppercase">Upload directory</h3>
            <p className="mt-3 font-mono text-2xl font-semibold">{formatFileSize(data.uploadDirectory.totalBytes)}</p>
            <p className="text-zinc-500 mt-2 text-sm">Physical files in public/uploads</p>
            <p className="text-zinc-500 mt-1 text-xs">{data.uploadDirectory.fileCount} files</p>
          </motion.div>
        </div>
      ) : null}
    </div>
  );
}
