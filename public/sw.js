/*
 * Rotary Platform offline shell.
 *
 * This worker deliberately does not cache documents, API responses, cookies,
 * or any authenticated HTML. It only keeps the offline notice and immutable
 * versioned/static assets available for the next visit.
 */
const STATIC_CACHE = "rotary-static-v1";
const OFFLINE_URL = "/offline.html";

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isPublicStaticAsset(url) {
  return url.pathname === "/manifest.webmanifest"
    || url.pathname === "/icon.svg"
    || url.pathname === "/favicon.ico"
    || url.pathname.startsWith("/_next/static/")
    || url.pathname.startsWith("/icons/");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (!isSameOrigin(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL)),
    );
    return;
  }

  if (!isPublicStaticAsset(url)) return;

  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
      if (!response.ok) return response;
      const copy = response.clone();
      void caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
      return response;
    })),
  );
});
