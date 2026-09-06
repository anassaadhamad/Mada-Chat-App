/**
 * Auth.js encrypts the session JWT with this value. Must stay stable across restarts
 * and match what was used when the cookie was issued.
 *
 * For **signing** new sessions, the first entry is used. If `AUTH_SECRET` and `NEXTAUTH_SECRET`
 * are both set to different values, we return `[AUTH_SECRET, NEXTAUTH_SECRET]` so decoding
 * still accepts cookies minted with either secret (avoids `JWTSessionError: no matching decryption secret`
 * during migration). Prefer a single `AUTH_SECRET` long-term.
 */
export function getAuthSecret(): string | string[] | undefined {
  const auth = process.env.AUTH_SECRET?.trim();
  const nextAuth = process.env.NEXTAUTH_SECRET?.trim();
  if (!auth && !nextAuth) return undefined;
  if (auth && nextAuth && auth !== nextAuth) {
    console.warn(
      "[auth] AUTH_SECRET and NEXTAUTH_SECRET differ; both are used for JWT decode, new sessions use AUTH_SECRET. " +
        "Remove NEXTAUTH_SECRET when legacy cookies are gone."
    );
    return [auth, nextAuth];
  }
  return auth || nextAuth || undefined;
}
