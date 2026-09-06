import type { NextAuthConfig } from "next-auth";
import { authRedirectCallback } from "@/lib/auth-callback-path";
import { getAuthSecret } from "@/lib/auth-secret";

/**
 * Edge-safe Auth.js config for `middleware.ts` only.
 * Do not import OAuth providers or DB-backed `jwt` here — they pull Node APIs (e.g. `stream`)
 * and break the Edge runtime. Full providers + `jwt` live in `auth.ts`.
 */
export const authConfig = {
  trustHost: true,
  secret: getAuthSecret(),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    redirect: authRedirectCallback,
    authorized: ({ auth, request }) => {
      const path = request.nextUrl.pathname;
      if (path.startsWith("/chat")) {
        return !!auth?.user && !auth?.user?.suspended;
      }
      if (path.startsWith("/admin")) {
        return auth?.user?.role === "ADMIN";
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
