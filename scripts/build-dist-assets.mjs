import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");

async function copyIfExists(source, target) {
  try {
    await fs.copyFile(source, target);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function walkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function toAssetPath(filePath) {
  const relative = path.relative(distDir, filePath).replaceAll(path.sep, "/");
  return `./${relative}`;
}

async function readAppVersion() {
  const constants = await fs.readFile(path.join(rootDir, "src/config/constants.js"), "utf8");
  return constants.match(/APP_VERSION\s*=\s*"([^"]+)"/)?.[1] || `build-${Date.now()}`;
}

function buildServiceWorkerSource(cacheName, assets) {
  return `const CACHE_NAME = ${JSON.stringify(cacheName)};
const ASSETS = ${JSON.stringify(assets, null, 2)};

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
    const response = await fetch(request);
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
`;
}

await fs.mkdir(distDir, { recursive: true });
await copyIfExists(path.join(rootDir, "manifest.webmanifest"), path.join(distDir, "manifest.webmanifest"));
await copyIfExists(path.join(rootDir, "index.php"), path.join(distDir, "index.php"));

const files = await walkFiles(distDir);
const precache = new Set(["./", "./index.html", "./manifest.webmanifest"]);
files
  .map(toAssetPath)
  .filter((asset) => !asset.endsWith("/sw.js") && !asset.endsWith("/index.php"))
  .forEach((asset) => precache.add(asset));

const appVersion = await readAppVersion();
const serviceWorker = buildServiceWorkerSource(`bike-packing-prototype-${appVersion}`, [...precache].sort());
await fs.writeFile(path.join(distDir, "sw.js"), serviceWorker, "utf8");
