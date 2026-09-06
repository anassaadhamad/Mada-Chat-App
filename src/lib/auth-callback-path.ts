/**
 * Same dev machine, different loopback hostnames — cookies are not shared across them.
 * NextAuth may rewrite the request URL to `AUTH_URL` (e.g. localhost) while the browser tab
 * is on `127.0.0.1`; treat these as equivalent for redirect decisions only.
 */
export function isLoopbackOriginEquivalent(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    const lh = (h: string) =>
      h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1";
    return lh(ua.hostname) && lh(ub.hostname) && ua.port === ub.port;
  } catch {
    return false;
  }
}

/**
 * Auth.js `callbacks.redirect` — extends default behavior so loopback host mismatches
 * still accept the client `callbackUrl` (avoids bouncing to `AUTH_URL` localhost while
 * the session cookie lives on `127.0.0.1`).
 */
export function authRedirectCallback({ url, baseUrl }: { url: string; baseUrl: string }): string {
  if (url.startsWith("/")) return `${baseUrl}${url}`;
  try {
    const target = new URL(url);
    const base = new URL(baseUrl);
    if (target.origin === base.origin) return url;
    if (isLoopbackOriginEquivalent(target.origin, base.origin)) return url;
  } catch {
    return baseUrl;
  }
  return baseUrl;
}

/**
 * Returns a safe post-login URL on the **current browser** origin.
 * Uses absolute URLs on the client so Auth.js (after `reqWithEnvURL`) still redirects
 * back to the same host the user signed in on.
 */
export function postLoginPath(callbackUrl: string | null | undefined): string {
  const fallbackPath = "/chat";
  const raw = (callbackUrl ?? "").trim();
  const win = typeof window !== "undefined" ? window.location.origin : null;

  if (!raw) {
    return win ? new URL(fallbackPath, win).href : fallbackPath;
  }

  try {
    if (raw.startsWith("/") && !raw.startsWith("//")) {
      return win ? new URL(raw, win).href : raw;
    }
    const absolute = new URL(raw);
    if (!win) {
      return `${absolute.pathname}${absolute.search}${absolute.hash}` || fallbackPath;
    }
    const here = new URL(win);
    if (absolute.origin === here.origin) {
      return absolute.href;
    }
    if (isLoopbackOriginEquivalent(absolute.origin, here.origin)) {
      return new URL(`${absolute.pathname}${absolute.search}${absolute.hash}`, here.origin).href;
    }
    return `${absolute.pathname}${absolute.search}${absolute.hash}` || new URL(fallbackPath, win).href;
  } catch {
    return win ? new URL(fallbackPath, win).href : fallbackPath;
  }
}

/**
 * Absolute URL on the **current browser** origin (e.g. `http://127.0.0.1:3000/`).
 * Use for `signOut({ callbackUrl })` / `signIn` redirects so the host matches the tab
 * (Auth.js may otherwise use `AUTH_URL`, often `localhost`, which is a different site for cookies).
 */
export function postAuthRedirectUrl(path: string = "/"): string {
  if (typeof window === "undefined") {
    return path.startsWith("/") ? path : "/";
  }
  try {
    return new URL(path, window.location.origin).href;
  } catch {
    return `${window.location.origin}/`;
  }
}
