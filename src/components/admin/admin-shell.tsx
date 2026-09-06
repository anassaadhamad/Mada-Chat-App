"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { LayoutDashboard, MessageSquareWarning, HardDrive, Users, LogOut } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { postAuthRedirectUrl } from "@/lib/auth-callback-path";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/moderation", label: "Reports", icon: MessageSquareWarning },
  { href: "/admin/storage", label: "Storage", icon: HardDrive },
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <div className="bg-zinc-950 text-zinc-100 flex min-h-[100dvh]">
      <motion.aside
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="border-white/10 flex w-56 shrink-0 flex-col border-r md:w-64"
      >
        <div className="border-white/10 flex flex-col gap-1 border-b p-4">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-violet-300/90 uppercase">Command</p>
          <h1 className="font-semibold text-lg tracking-tight">Mada Admin</h1>
          <p className="text-zinc-500 truncate text-xs">{session?.user?.email}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/admin" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-violet-500/15 text-violet-100 ring-1 ring-violet-400/30"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                )}
              >
                <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-white/10 flex flex-col gap-1 border-t p-2">
          <Link
            href="/chat"
            className="text-zinc-500 hover:text-zinc-200 rounded-lg px-3 py-2 text-xs transition-colors"
          >
            Back to app
          </Link>
          <button
            type="button"
            onClick={() => void signOut({ callbackUrl: postAuthRedirectUrl("/") })}
            className="text-zinc-500 hover:text-red-300 flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors"
          >
            <LogOut className="size-3.5" aria-hidden />
            Sign out
          </button>
        </div>
      </motion.aside>
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">{children}</div>
      </main>
    </div>
  );
}
