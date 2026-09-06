"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

type Report = {
  id: string;
  status: string;
  reason: string;
  createdAt: number;
  reporterEmail: string | null;
  reporterName: string | null;
  messagePreview: string | null;
  messageCreatedAt: number | null;
  conversationId?: string;
};

export default function AdminModerationPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/reports?limit=100");
        if (!res.ok) {
          if (!cancelled) setError("Failed to load reports");
          return;
        }
        const data = (await res.json()) as { reports: Report[] };
        if (!cancelled) {
          setReports(data.reports);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Failed to load reports");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Reported content</h2>
        <p className="text-zinc-500 mt-1 max-w-2xl text-sm">
          User-submitted message reports (via <code className="text-violet-300">MessageReport</code> records).
          When no reporting API is wired yet, this list stays empty.
        </p>
      </header>

      {error ? <p className="text-red-400 text-sm">{error}</p> : null}

      {reports.length === 0 && !error ? (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-zinc-500 border-white/10 rounded-xl border border-dashed px-6 py-12 text-center text-sm"
        >
          No reported messages yet. Flagging can be added to the chat UI to populate this queue.
        </motion.p>
      ) : (
        <ul className="space-y-3">
          {reports.map((r, i) => (
            <motion.li
              key={r.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="border-white/10 bg-zinc-900/60 rounded-xl border p-4"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300">{r.status}</span>
                <span className="text-zinc-500">{new Date(r.createdAt).toLocaleString()}</span>
                <span className="text-zinc-400">
                  Reporter: {r.reporterName || r.reporterEmail || "—"}
                </span>
              </div>
              {r.reason ? <p className="text-zinc-400 mt-2 text-sm">{r.reason}</p> : null}
              {r.messagePreview ? (
                <blockquote className="text-zinc-300 mt-2 border-l-2 border-violet-500/50 pl-3 text-sm italic">
                  {r.messagePreview}
                </blockquote>
              ) : null}
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
