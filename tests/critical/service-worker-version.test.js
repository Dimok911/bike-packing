import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("CRITICAL offline-start: app, index and service worker cache versions stay aligned", () => {
  const constants = read("src/config/constants.js");
  const index = read("index.html");
  const serviceWorker = read("sw.js");

  const appVersion = constants.match(/APP_VERSION\s*=\s*"v(\d+)"/)?.[1];
  assert.ok(appVersion, "APP_VERSION must use v<number>");

  assert.match(index, new RegExp(`styles\\.css\\?v=${appVersion}`));
  assert.match(index, new RegExp(`app\\.js\\?v=${appVersion}`));
  assert.match(serviceWorker, new RegExp(`bike-packing-prototype-v${appVersion}`));
  assert.match(serviceWorker, new RegExp(`styles\\.css\\?v=${appVersion}`));
  assert.match(serviceWorker, new RegExp(`app\\.js\\?v=${appVersion}`));
});

test("CRITICAL offline-start: navigation refreshes online and falls back to cached app shell", () => {
  const serviceWorker = read("sw.js");
  const serveAppShell = serviceWorker.slice(serviceWorker.indexOf("async function serveAppShell"));
  const cachedIndex = serveAppShell.indexOf('caches.match("./index.html")');
  const fetchIndex = serveAppShell.indexOf("fetch(request");
  const cachedFallbackIndex = serveAppShell.indexOf("if (cached) return cached");

  assert.ok(cachedIndex >= 0, "serveAppShell must look for cached index.html");
  assert.ok(fetchIndex >= 0, "serveAppShell must refresh app shell from network while online");
  assert.ok(cachedFallbackIndex >= 0, "serveAppShell must return cached shell when network fails");
  assert.ok(fetchIndex < cachedFallbackIndex, "network refresh must happen before cached offline fallback");
});

test("CRITICAL offline-start: app registration activates waiting service workers", () => {
  const registration = read("src/sync/service-worker.js");

  assert.match(registration, /registration\.waiting/);
  assert.match(registration, /SKIP_WAITING/);
  assert.match(registration, /controllerchange/);
});

test("CRITICAL offline-start: production build preserves runtime cache-busting URLs", () => {
  const buildScript = read("scripts/build-dist-assets.mjs");
  assert.match(buildScript, /async function versionDistEntryAssets\(appVersion\)/);
  assert.match(buildScript, /app\\\.js\|styles\\\.css/);
  assert.match(buildScript, /versionRuntimeAsset\(asset, appVersion\)/);
  assert.match(buildScript, /await versionDistEntryAssets\(appVersion\)/);
});
