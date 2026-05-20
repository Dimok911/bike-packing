const CACHE_NAME = "bike-packing-prototype-v663";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=663",
  "./app.js?v=663",
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
  const cached = await caches.match(request) || await caches.match("./index.html") || await caches.match("./");
  try {
    const response = await fetch(request, { cache: "reload" });
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
      await cache.put("./index.html", response.clone());
    }
    return response;
  } catch {
    if (cached) return cached;
    return new Response("The app is not cached for offline use yet.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
}
