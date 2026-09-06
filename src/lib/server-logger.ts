/** Dev-only logging for the Node server and API route code paths. Production keeps `console.error` for real failures. */

const isProd = process.env.NODE_ENV === "production";

export function devLog(...args: unknown[]): void {
  if (!isProd) console.log(...args);
}

export function devWarn(...args: unknown[]): void {
  if (!isProd) console.warn(...args);
}

export function logError(...args: unknown[]): void {
  console.error(...args);
}
