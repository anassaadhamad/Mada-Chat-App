"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, Database, MessageSquare, Users } from "lucide-react";

type StatsPayload = {
  totalUsers: number;
  activeConversations: number;
  totalMessages: number;
  dbPingMs: number | null;
  dbConnected: boolean;
  uptimeSeconds: number;
  charts: {
    newUsersPerDay: { date: string; count: number }[];
    messagesByHour: { hour: number; count: number }[];
  };
};

function formatUptime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  delay,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: typeof Users;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className="border-white/10 bg-zinc-900/60 relative overflow-hidden rounded-2xl border p-5 shadow-[0_0_40px_-12px_rgba(139,92,246,0.35)]"
    >
      <div className="from-violet-500/10 pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-zinc-500 text-xs font-medium tracking-wide uppercase">{title}</p>
          <p className="mt-2 font-mono text-2xl font-semibold tracking-tight md:text-3xl">{value}</p>
          {subtitle ? <p className="text-zinc-500 mt-1 text-xs">{subtitle}</p> : null}
        </div>
        <div className="rounded-xl bg-violet-500/10 p-2.5 ring-1 ring-violet-400/20">
          <Icon className="text-violet-300 size-5" aria-hidden />
        </div>
      </div>
    </motion.div>
  );
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<StatsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/stats");
      if (!res.ok) {
        setError(res.status === 403 ? "Forbidden" : "Failed to load");
        return;
      }
      const json = (await res.json()) as StatsPayload;
      setData(json);
    } catch {
      setError("Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hourChartData =
    data?.charts.messagesByHour.map((r) => ({
      label: `${String(r.hour).padStart(2, "0")}:00`,
      messages: r.count,
    })) ?? [];

  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Overview</h2>
        <p className="text-zinc-500 max-w-2xl text-sm">
          Live counts, database latency, process uptime, and messaging activity across the platform.
        </p>
      </header>

      {error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : !data ? (
        <p className="text-zinc-500 text-sm">Loading metrics…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Total users" value={String(data.totalUsers)} icon={Users} delay={0} />
            <StatCard
              title="Conversations"
              value={String(data.activeConversations)}
              subtitle="Unique conversation documents"
              icon={MessageSquare}
              delay={0.06}
            />
            <StatCard
              title="Messages"
              value={String(data.totalMessages)}
              subtitle="All message records"
              icon={MessageSquare}
              delay={0.12}
            />
            <StatCard
              title="System health"
              value={data.dbConnected ? "Online" : "Degraded"}
              subtitle={`Uptime ${formatUptime(data.uptimeSeconds)} · DB ping ${data.dbPingMs != null ? `${data.dbPingMs}ms` : "—"}`}
              icon={Activity}
              delay={0.18}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="border-white/10 bg-zinc-900/50 rounded-2xl border p-4 md:p-6"
            >
              <div className="mb-4 flex items-center gap-2">
                <Database className="text-violet-400 size-4" aria-hidden />
                <h3 className="font-medium">New users per day</h3>
                <span className="text-zinc-500 ml-auto text-xs">Last 30 days (UTC)</span>
              </div>
              <div className="text-violet-100 h-[260px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.charts.newUsersPerDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: "#a1a1aa", fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: "#a1a1aa", fontSize: 10 }} tickLine={false} axisLine={false} width={32} />
                    <Tooltip
                      contentStyle={{
                        background: "#18181b",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 8,
                      }}
                      labelStyle={{ color: "#e4e4e7" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      name="Sign-ups"
                      stroke="#a78bfa"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: "#c4b5fd" }}
                      isAnimationActive
                      animationDuration={900}
                      animationEasing="ease-out"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="border-white/10 bg-zinc-900/50 rounded-2xl border p-4 md:p-6"
            >
              <div className="mb-4 flex items-center gap-2">
                <MessageSquare className="text-fuchsia-400 size-4" aria-hidden />
                <h3 className="font-medium">Peak messaging times</h3>
                <span className="text-zinc-500 ml-auto text-xs">By hour UTC · last 14 days</span>
              </div>
              <div className="text-fuchsia-100 h-[260px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 9 }} tickLine={false} axisLine={false} interval={2} />
                    <YAxis tick={{ fill: "#a1a1aa", fontSize: 10 }} tickLine={false} axisLine={false} width={32} />
                    <Tooltip
                      contentStyle={{
                        background: "#18181b",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 8,
                      }}
                    />
                    <Bar
                      dataKey="messages"
                      name="Messages"
                      fill="#e879f9"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={28}
                      isAnimationActive
                      animationDuration={800}
                      animationEasing="ease-out"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </div>
  );
}
