import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REQUIRED_ADMIN_API_CAPABILITIES,
  REQUIRED_ADMIN_API_VERSION
} from "../src/config/api-contract.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputArg = process.argv[2] || process.env.BIKE_PACKING_DIST_DIR || "dist";
const distDir = path.resolve(rootDir, outputArg);

async function copyIfExists(source, target) {
  try {
    await fs.copyFile(source, target);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function readAppVersion() {
  const constants = await fs.readFile(path.join(rootDir, "src/config/constants.js"), "utf8");
  return constants.match(/APP_VERSION\s*=\s*"([^"]+)"/)?.[1] || `build-${Date.now()}`;
}

function runtimeVersionToken(appVersion) {
  return String(appVersion || "").replace(/^v/, "");
}

async function versionDistEntryAssets(appVersion) {
  const indexPath = path.join(distDir, "index.html");
  const source = await fs.readFile(indexPath, "utf8");
  const version = runtimeVersionToken(appVersion);
  const versioned = source.replace(
    /(\b(?:src|href)=["']\.\/(?:app\.js|styles\.css))(?:\?v=[^"']*)?(["'])/g,
    `$1?v=${version}$2`
  );
  await fs.writeFile(indexPath, versioned, "utf8");
}

async function writeReleaseContract(appVersion) {
  const contract = {
    schemaVersion: 1,
    appVersion,
    requiredApiCompatibilityVersion: REQUIRED_ADMIN_API_VERSION,
    requiredApiCapabilities: REQUIRED_ADMIN_API_CAPABILITIES
  };
  await fs.writeFile(
    path.join(distDir, "release-contract.json"),
    `${JSON.stringify(contract, null, 2)}\n`,
    "utf8"
  );
}

function buildServiceWorkerSource(cacheName, assets) {
  return `const CACHE_NAME = ${JSON.stringify(cacheName)};
const PRESERVED_CACHE_NAMES = new Set(["bike-packing-manufacturer-catalog-offline-v1"]);
const ASSETS = ${JSON.stringify(assets, null, 2)};

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME && !PRESERVED_CACHE_NAMES.has(key)).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (event.request.headers.get("X-Bike-Packing-Offline-Catalog") === "1") return;
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
    return new Response("<!doctype html><title>Bike packing</title><meta name=\\"viewport\\" content=\\"width=device-width, initial-scale=1\\"><p>The app shell is not cached on this device yet. Open it once with internet, then it will work offline.</p>", {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
}
`;
}

await fs.mkdir(distDir, { recursive: true });
await copyIfExists(path.join(rootDir, "manifest.webmanifest"), path.join(distDir, "manifest.webmanifest"));
await copyIfExists(path.join(rootDir, "index.php"), path.join(distDir, "index.php"));

const appVersion = await readAppVersion();
await versionDistEntryAssets(appVersion);
await writeReleaseContract(appVersion);
const precache = new Set(["./", "./index.html", "./manifest.webmanifest"]);
const indexSource = await fs.readFile(path.join(distDir, "index.html"), "utf8");
for (const match of indexSource.matchAll(/\b(?:src|href)=["'](\.\/[^"'#?]+(?:\?[^"'#]*)?)["']/g)) {
  if (!match[1].endsWith("/sw.js") && !match[1].endsWith("/index.php")) precache.add(match[1]);
}

const serviceWorker = buildServiceWorkerSource(`bike-packing-prototype-${appVersion}`, [...precache].sort());
await fs.writeFile(path.join(distDir, "sw.js"), serviceWorker, "utf8");
