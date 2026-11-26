const CACHE_NAME = "bike-packing-prototype-v1659";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=1659",
  "./app.js?v=1659",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const scope = self.registration.scope;
    for (const key of await caches.keys()) {
      if (key === CACHE_NAME || !/^bike-packing-prototype-v\d+$/.test(key)) continue;
      const old = await caches.open(key);
      const entries = await old.keys();
      // CacheStorage is shared by the entire origin, including other applications.
      const ownsIndex = entries.some((entry) => entry.url === new URL("./index.html", scope).href);
      if (ownsIndex && entries.every((entry) => entry.url.startsWith(scope))) await caches.delete(key);
    }
    await self.clients.claim();
  })());
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
  if (isApiRequest) return;
  if (event.request.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("/index.html")) {
    event.respondWith(serveAppShell(event.request));
    return;
  }
  event.respondWith(
    caches.match(event.request, { ignoreVary: true }).then((cached) => {
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
  // A failed/black-holed connection must not hold a saved workspace hostage.
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(new URL("./index.html", self.registration.scope).href, { ignoreVary: true })
    || await cache.match(request, { ignoreVary: true });
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("App shell network deadline"));
    }, cached ? 1500 : 8000);
  });
  try {
    return await Promise.race([deadline, (async () => {
      const response = await fetch(request, { cache: "reload", signal: controller.signal });
      if (!response.ok) throw new Error("App shell unavailable");
      const html = await response.clone().text();
      // Do not pair new-release HTML with an older installed worker's assets.
      const entryAssets = ASSETS.filter((asset) => /^\.\/(app\.js|styles\.css)\?/.test(asset));
      if (entryAssets.every((asset) => html.includes(asset))) {
        await cache.put("./index.html", response.clone());
        await cache.put("./", response.clone());
      } else if (cached) {
        return cached;
      }
      return response;
    })()]);
  } catch {
    if (cached) return cached;
    return new Response('<!doctype html><title>Bike packing</title><meta name="viewport" content="width=device-width, initial-scale=1"><p>The app shell is not cached on this device yet. Open it once with internet, then it will work offline.</p>', {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  } finally {
    clearTimeout(timer);
  }
}
