import type { IncomingMessage } from "http";
import { getToken } from "next-auth/jwt";
import { getAuthSecret } from "../src/lib/auth-secret";
/** Match Auth.js cookie mode: only expect secure cookie names when served over HTTPS. */
function jwtSecureCookieFlag(): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  const url = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "";
  return typeof url === "string" && url.startsWith("https://");
}

/**
 * Resolves the signed-in user id from the Engine.IO handshake (session cookie).
 */
export async function getUserIdFromHandshake(req: IncomingMessage): Promise<string | null> {
  const secret = getAuthSecret();
  if (!secret) {    console.error("[socket-auth] AUTH_SECRET is not set");
    return null;
  }

  const secureCookie = jwtSecureCookieFlag();

  const cookieHeader = req.headers.cookie;
  const token = await getToken({
    req: { headers: { cookie: typeof cookieHeader === "string" ? cookieHeader : "" } },
    secret,
    secureCookie,
  });

  if (!token) {
    return null;
  }

  const id = token.id ?? token.sub;
  return typeof id === "string" ? id : null;
}
