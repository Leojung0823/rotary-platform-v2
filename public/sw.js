/*
 * Public offline shell for 「我是扶輪人」.
 *
 * This worker deliberately does not cache documents, API responses, cookies,
 * or any authenticated HTML. It only keeps the offline notice and immutable
 * versioned/static assets available for the next visit.
 */
// Bump when changing the public asset allow-list or cache behavior. Activation
// removes previous worker caches so outdated app-shell assets cannot linger.
const STATIC_CACHE = "rotary-static-v2";
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
      .then((cache) => cache.add(OFFLINE_URL)),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith("rotary-static-") && key !== STATIC_CACHE)
          .map((key) => caches.delete(key)),
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
      fetch(request).catch(async () => {
        const cache = await caches.open(STATIC_CACHE);
        return cache.match(OFFLINE_URL);
      }),
    );
    return;
  }

  if (!isPublicStaticAsset(url)) return;

  event.respondWith(caches.open(STATIC_CACHE).then(async (cache) => {
    const cached = await cache.match(request);

    // Next's content-hashed chunks are immutable; stable public URLs must
    // revalidate so a deployed icon or manifest cannot remain stale forever.
    if (url.pathname.startsWith("/_next/static/")) {
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone()).catch(() => undefined);
      return response;
    }

    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone()).catch(() => undefined);
      return response;
    } catch {
      return cached ?? Response.error();
    }
  }));
});
