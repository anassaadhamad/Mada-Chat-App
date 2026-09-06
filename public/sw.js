/* eslint-disable no-undef */
/** Bump when changing caching rules so old Cache Storage buckets are dropped. */
const CACHE_VERSION = "v3";
const CACHE_SHELL = `mada-shell-${CACHE_VERSION}`;
const CACHE_ASSETS = `mada-assets-${CACHE_VERSION}`;
const CACHE_API = `mada-api-${CACHE_VERSION}`;

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

/** `cache.put` rejects partial responses (e.g. 206) and ranged bodies. */
function canCachePut(res) {
  if (!res || !res.ok) return false;
  if (res.status === 206) return false;
  if (res.headers.get("Content-Range")) return false;
  return true;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_SHELL)
      .then((cache) =>
        Promise.all([
          cache.add(new Request("/chat", { credentials: "include" })).catch(() => {}),
          cache.add(new Request("/login", { credentials: "include" })).catch(() => {}),
        ])
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key === CACHE_SHELL || key === CACHE_ASSETS || key === CACHE_API) return Promise.resolve();
            if (key.startsWith("mada-shell-") || key.startsWith("mada-assets-") || key.startsWith("mada-api-")) {
              return caches.delete(key);
            }
            return Promise.resolve();
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try {
    url = new URL(req.url);
  } catch (_) {
    return;
  }
  if (!isSameOrigin(url)) return;

  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (canCachePut(res)) {
            void caches.open(CACHE_SHELL).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req, { ignoreSearch: false }).then((cached) => {
            if (cached) return cached;
            return caches.match("/chat").then((r) => r || caches.match("/login"));
          })
        )
    );
    return;
  }

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/sounds/") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(
      caches.open(CACHE_ASSETS).then((cache) =>
        cache.match(req).then((cached) => {
          const network = fetch(req)
            .then((res) => {
              if (canCachePut(res)) void cache.put(req, res.clone());
              return res;
            })
            .catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  if (
    url.pathname === "/api/conversations" ||
    /^\/api\/conversations\/[^/]+\/messages/.test(url.pathname)
  ) {
    event.respondWith(
      caches.open(CACHE_API).then((cache) =>
        fetch(req)
          .then((res) => {
            if (canCachePut(res)) void cache.put(req, res.clone());
            return res;
          })
          .catch(() =>
            cache.match(req).then((cached) => {
              if (cached) return cached;
              return Response.error();
            })
          )
      )
    );
    return;
  }
});

self.addEventListener("push", (event) => {
  let payload = { title: "Mada", body: "", url: "/", tag: "chat-message" };
  try {
    const text = event.data?.text();
    if (text) {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") {
        payload = { ...payload, ...parsed };
      }
    }
  } catch (_) {
    /* ignore */
  }
  let pushUrl = typeof payload.url === "string" ? payload.url : "/chat";
  try {
    if (pushUrl.startsWith("/")) {
      pushUrl = new URL(pushUrl, self.location.origin).href;
    }
  } catch (_) {
    pushUrl = new URL("/chat", self.location.origin).href;
  }
  const tag = typeof payload.tag === "string" ? payload.tag : "chat-message";
  event.waitUntil(
    self.registration.showNotification(payload.title || "Mada", {
      body: typeof payload.body === "string" ? payload.body : "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag,
      data: { url: pushUrl },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let raw = event.notification.data && event.notification.data.url;
  if (typeof raw !== "string" || !raw.trim()) {
    raw = "/chat";
  }
  let targetUrl;
  try {
    targetUrl = raw.startsWith("http") ? raw : new URL(raw, self.location.origin).href;
  } catch (_) {
    targetUrl = new URL("/chat", self.location.origin).href;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const target = new URL(targetUrl);
      for (const client of clientList) {
        try {
          const cur = new URL(client.url);
          if (cur.origin === target.origin) {
            return client
              .focus()
              .then(() => {
                if ("navigate" in client && typeof client.navigate === "function") {
                  return client.navigate(targetUrl);
                }
                client.postMessage({ type: "SECRET_CHAT_NAVIGATE", url: targetUrl });
              })
              .catch(() => self.clients.openWindow(targetUrl));
          }
        } catch (_) {
          /* continue */
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
