/* TRYOS Prep service worker — app shell + CDN assets cached so it also works offline.
   Bump CACHE when you change index.html so users get the new version. */
const CACHE = "tryos-prep-v22-auth";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/about/abed.jpg", "/auth.js", "/supabase-config.js",
  "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png", "/icons/apple-touch-icon.png", "/iq/test1.json", "/iq/test2.json", "/iq/test3.json", "/iq/test4.json", "/iq/test5.json", "/iq/test6.json", "/iq/test7.json", "/iq/test8.json", "/iq/test9.json", "/iq/test10.json", "/iq/test11.json"];
const CDN_HOSTS = ["cdn.jsdelivr.net", "cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Page navigations: network first (always fresh), fall back to cached page when offline
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put("/index.html", copy));
        return res;
      }).catch(() => caches.match("/index.html").then((r) => r || caches.match("/")))
    );
    return;
  }

  if (url.pathname.startsWith("/api/") || url.pathname.endsWith("/supabase-config.js") || url.pathname.endsWith("/auth.js")) {
    e.respondWith(fetch(req));
    return;
  }

  // Same-origin files and the CDN (KaTeX / fonts): cache first, fill cache on first use
  if (url.origin === location.origin || CDN_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res && (res.ok || res.type === "opaque")) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit))
    );
  }
});
