"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AdminUserRow = {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "ADMIN";
  suspended: boolean;
  suspendedAt: number | null;
  createdAt: number;
  lastSeenAt: number | null;
};

type ConvRow = {
  id: string;
  peerUserId: string | null;
  peerEmail: string | null;
  peerName: string | null;
  lastMessageAt: number | null;
};

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sortBy, setSortBy] = useState<"createdAt" | "email" | "lastSeenAt">("createdAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const [convUser, setConvUser] = useState<AdminUserRow | null>(null);
  const [convList, setConvList] = useState<ConvRow[]>([]);
  const [convLoading, setConvLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const limit = 15;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sortBy,
        order,
      });
      if (debounced) params.set("search", debounced);
      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (!res.ok) {
        setError("Failed to load users");
        setUsers([]);
        return;
      }
      const data = (await res.json()) as { users: AdminUserRow[]; total: number };
      setUsers(data.users);
      setTotal(data.total);
    } catch {
      setError("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, order, debounced]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debounced, sortBy, order]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total]);

  async function patchUser(userId: string, body: { suspended?: boolean; role?: "USER" | "ADMIN" }) {
    setActionBusy(userId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Update failed");
        return;
      }
      await load();
    } catch {
      setError("Update failed");
    } finally {
      setActionBusy(null);
    }
  }

  async function openConversations(u: AdminUserRow) {
    setConvUser(u);
    setConvList([]);
    setConvLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(u.id)}/conversations`);
      const data = (await res.json()) as { conversations?: ConvRow[] };
      setConvList(data.conversations ?? []);
    } catch {
      setConvList([]);
    } finally {
      setConvLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Users</h2>
        <p className="text-zinc-500 mt-1 max-w-2xl text-sm">
          Search, sort, suspend accounts, adjust roles, and inspect conversations for support.
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-md flex-1 space-y-1">
          <label className="text-zinc-500 text-xs" htmlFor="user-search">
            Search email or name
          </label>
          <Input
            id="user-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="border-white/15 bg-zinc-900/80 text-zinc-100 placeholder:text-zinc-600"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="text-zinc-500 self-center text-xs">Sort</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="border-white/15 bg-zinc-900/80 rounded-md border px-2 py-1.5 text-sm"
          >
            <option value="createdAt">Created</option>
            <option value="email">Email</option>
            <option value="lastSeenAt">Last seen</option>
          </select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-white/20 bg-transparent"
            onClick={() => setOrder((o) => (o === "asc" ? "desc" : "asc"))}
          >
            {order === "asc" ? "Ascending" : "Descending"}
          </Button>
        </div>
      </div>

      {error ? <p className="text-red-400 text-sm">{error}</p> : null}

      <div className="border-white/10 overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-white/10 bg-zinc-900/80 border-b text-xs text-zinc-500 uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">User</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Created</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="text-zinc-500 px-3 py-8 text-center">
                  Loading…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-zinc-500 px-3 py-8 text-center">
                  No users match this search.
                </td>
              </tr>
            ) : (
              users.map((u, i) => (
                <motion.tr
                  key={u.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: i * 0.02 }}
                  className="border-white/5 hover:bg-white/[0.03] border-b last:border-0"
                >
                  <td className="px-3 py-3">
                    <div className="font-medium text-zinc-100">{u.email}</div>
                    {u.name ? <div className="text-zinc-500 text-xs">{u.name}</div> : null}
                  </td>
                  <td className="text-zinc-300 px-3 py-3">
                    <span
                      className={
                        u.role === "ADMIN"
                          ? "rounded-full bg-violet-500/20 px-2 py-0.5 text-xs text-violet-200"
                          : "text-xs"
                      }
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {u.suspended ? (
                      <span className="text-amber-300 text-xs">Suspended</span>
                    ) : (
                      <span className="text-emerald-300/90 text-xs">Active</span>
                    )}
                  </td>
                  <td className="text-zinc-500 px-3 py-3 text-xs tabular-nums">
                    {new Date(u.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-white/15 h-8 text-xs"
                        disabled={!!actionBusy}
                        onClick={() => void openConversations(u)}
                      >
                        Conversations
                      </Button>
                      {u.suspended ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-emerald-500/30 h-8 text-xs text-emerald-200"
                          disabled={actionBusy === u.id}
                          onClick={() => void patchUser(u.id, { suspended: false })}
                        >
                          Reactivate
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-amber-500/30 h-8 text-xs text-amber-200"
                          disabled={actionBusy === u.id}
                          onClick={() => void patchUser(u.id, { suspended: true })}
                        >
                          Suspend
                        </Button>
                      )}
                      {u.role === "ADMIN" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          disabled={actionBusy === u.id}
                          onClick={() => void patchUser(u.id, { role: "USER" })}
                        >
                          Demote
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          disabled={actionBusy === u.id}
                          onClick={() => void patchUser(u.id, { role: "ADMIN" })}
                        >
                          Make admin
                        </Button>
                      )}
                    </div>
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2 text-sm">
        <p className="text-zinc-500">
          Page {page} of {totalPages} · {total} users
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {convUser ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="conv-dialog-title"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setConvUser(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="border-white/10 bg-zinc-900 max-h-[80vh] w-full max-w-lg overflow-hidden rounded-xl border shadow-xl"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="border-white/10 flex items-center justify-between border-b px-4 py-3">
                <h3 id="conv-dialog-title" className="font-medium">
                  Conversations · {convUser.email}
                </h3>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConvUser(null)}>
                  Close
                </Button>
              </div>
              <div className="max-h-[55vh] overflow-y-auto p-4">
                {convLoading ? (
                  <p className="text-zinc-500 text-sm">Loading…</p>
                ) : convList.length === 0 ? (
                  <p className="text-zinc-500 text-sm">No conversations found.</p>
                ) : (
                  <ul className="space-y-2">
                    {convList.map((c) => (
                      <li
                        key={c.id}
                        className="border-white/10 rounded-lg border bg-zinc-950/50 px-3 py-2 text-sm"
                      >
                        <div className="text-zinc-200">
                          With {c.peerName || c.peerEmail || c.peerUserId || "unknown"}
                        </div>
                        <div className="text-zinc-500 mt-0.5 text-xs">
                          ID {c.id}
                          {c.lastMessageAt
                            ? ` · last activity ${new Date(c.lastMessageAt).toLocaleString()}`
                            : ""}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
