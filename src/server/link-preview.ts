/**
 * Server-only: fetch remote pages and extract Open Graph / basic metadata.
 * Used by the link-preview API to avoid client CORS and hide user IPs from targets.
 */

import {
  envLinkPreviewFetchTimeoutMs,
  envLinkPreviewMaxBodyBytes,
  envLinkPreviewMaxRedirects,
  envLinkPreviewOgDescriptionMax,
  envLinkPreviewOgTitleMax,
  envLinkPreviewUserAgent,
} from "@/lib/env-server";

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i;
const VIDEO_EXT_RE = /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i;

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (h === "0.0.0.0") return true;
  if (h === "::1" || h === "[::1]") return true;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  const m = h.match(/^172\.(\d{1,3})\./);
  if (m) {
    const n = Number(m[1]);
    if (n >= 16 && n <= 31) return true;
  }
  if (/^169\.254\./.test(h)) return true;
  if (/^\[?fe80:/i.test(h)) return true;
  return false;
}

export function assertPublicHttpUrl(urlStr: string): URL {
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    throw new Error("Invalid URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Invalid URL");
  }
  if (isBlockedHost(u.hostname)) {
    throw new Error("URL not allowed");
  }
  return u;
}

function ogTag(html: string, key: string): string | null {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta\\s+[^>]*property=["']${esc}["'][^>]*content=["']([^"']*)["']`,
      "i"
    ),
    new RegExp(
      `<meta\\s+[^>]*content=["']([^"']*)["'][^>]*property=["']${esc}["']`,
      "i"
    ),
    new RegExp(`<meta\\s+[^>]*name=["']${esc}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta\\s+[^>]*content=["']([^"']*)["'][^>]*name=["']${esc}["']`, "i"),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) {
      const v = decodeBasicEntities(m[1].trim());
      if (v) return v;
    }
  }
  return null;
}

function titleTag(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!m?.[1]) return null;
  const v = stripTags(decodeBasicEntities(m[1]));
  return v || null;
}

function resolveUrl(base: string, relative: string | null): string | null {
  if (!relative?.trim()) return null;
  try {
    return new URL(relative, base).href;
  } catch {
    return null;
  }
}

export type LinkPreviewResult =
  | {
      kind: "rich";
      url: string;
      title: string | null;
      description: string | null;
      imageUrl: string | null;
      domain: string;
    }
  | { kind: "image"; url: string; imageUrl: string }
  | { kind: "video"; url: string; videoUrl: string };

async function fetchWithRedirects(
  startUrl: string,
  init: RequestInit
): Promise<{ finalUrl: string; response: Response }> {
  let current = startUrl;
  const maxRedirects = envLinkPreviewMaxRedirects();
  const fetchTimeoutMs = envLinkPreviewFetchTimeoutMs();
  for (let i = 0; i < maxRedirects; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), fetchTimeoutMs);
    let res: Response;
    try {
      res = await fetch(current, {
        ...init,
        signal: ctrl.signal,
        redirect: "manual",
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("Redirect without location");
      current = new URL(loc, current).href;
      assertPublicHttpUrl(current);
      continue;
    }
    return { finalUrl: current, response: res };
  }
  throw new Error("Too many redirects");
}

export async function fetchLinkPreview(urlStr: string): Promise<LinkPreviewResult | null> {
  const canonical = assertPublicHttpUrl(urlStr);
  const href = canonical.href;
  const path = canonical.pathname;

  if (IMAGE_EXT_RE.test(path)) {
    return { kind: "image", url: href, imageUrl: href };
  }
  if (VIDEO_EXT_RE.test(path)) {
    return { kind: "video", url: href, videoUrl: href };
  }

  const { finalUrl, response } = await fetchWithRedirects(href, {
    headers: {
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      "User-Agent": envLinkPreviewUserAgent(),
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!response.ok) {
    return null;
  }

  const ct = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (ct.startsWith("image/")) {
    return { kind: "image", url: finalUrl, imageUrl: finalUrl };
  }
  if (ct.startsWith("video/")) {
    return { kind: "video", url: finalUrl, videoUrl: finalUrl };
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return null;
  }

  const maxBodyBytes = envLinkPreviewMaxBodyBytes();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBodyBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  reader.releaseLock();

  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  const html = buf.slice(0, maxBodyBytes).toString("utf8");

  let title = ogTag(html, "og:title") || ogTag(html, "twitter:title") || titleTag(html);
  let description =
    ogTag(html, "og:description") ||
    ogTag(html, "twitter:description") ||
    ogTag(html, "description");
  const ogDescMax = envLinkPreviewOgDescriptionMax();
  if (description) {
    description = description.slice(0, ogDescMax);
  }

  const ogImage =
    ogTag(html, "og:image") ||
    ogTag(html, "twitter:image") ||
    ogTag(html, "twitter:image:src");
  const imageUrl = resolveUrl(finalUrl, ogImage);

  const domain = (() => {
    try {
      return new URL(finalUrl).hostname.replace(/^www\./, "");
    } catch {
      return canonical.hostname.replace(/^www\./, "");
    }
  })();

  if (!title && !description && !imageUrl) {
    return null;
  }

  const ogTitleMax = envLinkPreviewOgTitleMax();
  const displayTitle = title?.slice(0, ogTitleMax) ?? (imageUrl && !description ? domain : null);

  return {
    kind: "rich",
    url: finalUrl,
    title: displayTitle,
    description: description ?? null,
    imageUrl,
    domain,
  };
}
