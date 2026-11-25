// FieldNotes AI — minimal offline shell.
// Strategy: cache the app shell on install; navigations are network-first
// with a cache fallback (so the app opens offline), static assets are
// cache-first. Notes data lives in localStorage, not in this cache.
// All shell paths are resolved against the service worker's scope, so the
// same file works at a domain root and under a subpath (GitHub Pages).
const CACHE = "fieldnotes-shell-v1";
const SCOPE = self.registration.scope;
const INDEX = new URL("index.html", SCOPE).href;
const SHELL = [
  SCOPE,
  INDEX,
  new URL("manifest.webmanifest", SCOPE).href,
  new URL("icon.svg", SCOPE).href,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !request.url.startsWith(self.location.origin)) {
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(INDEX, copy));
          return res;
        })
        .catch(() => caches.match(INDEX))
    );
    return;
  }
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
    )
  );
});
