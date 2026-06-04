const CACHE_NAME = "bike-packing-prototype-v1072";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=1072",
  "./app.js?v=1072",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const isApiRequest =
    url.origin !== self.location.origin ||
    url.pathname.includes("/letters-vniipo/api/") ||
    url.pathname.endsWith("/bike-packing-data.json");
  if (isApiRequest || event.request.cache === "no-store") return;
  if (event.request.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("/index.html")) {
    event.respondWith(serveAppShell(event.request));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    })
  );
});

async function serveAppShell(request) {
  // CRITICAL: offline-start. Online must refresh HTML; offline must fall back to cached app shell.
  const cached = await caches.match("./index.html") || await caches.match("./") || await caches.match(request);
  try {
    const response = await fetch(request, { cache: "reload" });
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
      await cache.put("./index.html", response.clone());
      await cache.put("./", response.clone());
    }
    return response;
  } catch {
    if (cached) return cached;
    return new Response("<!doctype html><title>Bike packing</title><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><p>The app shell is not cached on this device yet. Open it once with internet, then it will work offline.</p>", {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
}
