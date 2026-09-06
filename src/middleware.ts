import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export default NextAuth(authConfig).auth((req) => {
  const path = req.nextUrl.pathname;

  if (path.startsWith("/settings")) {
    if (!req.auth?.user) {
      const login = new URL("/login", req.nextUrl.origin);
      login.searchParams.set(
        "callbackUrl",
        new URL(req.nextUrl.pathname + req.nextUrl.search, req.nextUrl.origin).href
      );
      return NextResponse.redirect(login);
    }
    if (req.auth.user.suspended) {
      const login = new URL("/login", req.nextUrl.origin);
      login.searchParams.set("suspended", "1");
      return NextResponse.redirect(login);
    }
    return NextResponse.next();
  }

  if (path.startsWith("/api/admin")) {
    if (!req.auth?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (req.auth.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.next();
  }

  if (path.startsWith("/admin")) {
    if (!req.auth?.user?.id) {
      const login = new URL("/login", req.nextUrl.origin);
      const returnTo = new URL(req.nextUrl.pathname + req.nextUrl.search, req.nextUrl.origin);
      login.searchParams.set("callbackUrl", returnTo.href);
      return NextResponse.redirect(login);
    }
    if (req.auth.user.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/", req.nextUrl.origin));
    }
    return NextResponse.next();
  }

  if (path.startsWith("/chat")) {
    if (!req.auth?.user) {
      const login = new URL("/login", req.nextUrl.origin);
      const returnTo = new URL(req.nextUrl.pathname + req.nextUrl.search, req.nextUrl.origin);
      login.searchParams.set("callbackUrl", returnTo.href);
      return NextResponse.redirect(login);
    }
    if (req.auth.user.suspended) {
      const login = new URL("/login", req.nextUrl.origin);
      login.searchParams.set("suspended", "1");
      return NextResponse.redirect(login);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/settings", "/settings/:path*", "/chat/:path*", "/admin/:path*", "/api/admin/:path*"],
};
