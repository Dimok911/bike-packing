import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createGuestWorkspace,
  waitForApp,
} from "./guest-test-helpers.js";

test.use({ serviceWorkers: "allow" });

test("[pwa:offline] installed app shell opens the saved workspace without a network", { timeout: 60_000 }, async ({ browser }, testInfo) => {
  // Stop a real static server instead of protocol offline emulation, which
  // prevents Windows WebKit from dispatching even cached fetches to its worker.
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    if (!/^(?:index\.html|app\.js|styles\.css|sw\.js|release-contract\.json|manifest\.webmanifest|assets\/manifest-[\w-]+\.webmanifest)$/.test(relative)) {
      response.writeHead(404).end(); return;
    }
    const types = { js: "text/javascript", css: "text/css", html: "text/html", json: "application/json", webmanifest: "application/manifest+json" };
    try {
      const content = await readFile(resolve("www/vniipo-help.ru/bike-packing", relative));
      response.writeHead(200, { "Content-Type": types[relative.split(".").at(-1)], "Cache-Control": "no-store" }).end(content);
    } catch { response.writeHead(404).end(); }
  });
  const startServer = (port = 0) => new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const stopServer = () => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
  await startServer();
  const port = server.address().port;
  const context = await browser.newContext({ ...testInfo.project.use, baseURL: `http://bike-packing.localhost:${port}`, serviceWorkers: "allow" });
  const page = await context.newPage();
  try {
    let offline = false;
    await context.exposeBinding("pwaTestOffline", () => offline);
    await context.addInitScript(() => {
      localStorage.setItem("bike-packing-language-v1", "ru");
      const nativeFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === "string" ? input : input?.url || "";
        if (new URL(url, location.href).origin !== location.origin) {
          if (await window.pwaTestOffline()) throw new TypeError("Failed to fetch");
          return Promise.resolve(new Response(JSON.stringify({
            ok: true, user: null, templates: [], lists: [],
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }));
        }
        return nativeFetch(input, init);
      };
    });
    const layoutName = "Офлайн укладка";
    const containerName = "Офлайн сумка";
    const itemName = "Офлайн вещь";
    await createGuestWorkspace(page, { layoutName, containerName, itemName });

    const cacheState = await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Service worker did not control the page")), 10_000);
          navigator.serviceWorker.addEventListener("controllerchange", () => {
            clearTimeout(timeout);
            resolve();
          }, { once: true });
        });
      }
      const cacheNames = await caches.keys();
      const cachedUrls = (await Promise.all(cacheNames.map(async (name) => {
        const cache = await caches.open(name);
        return (await cache.keys()).map((request) => request.url);
      }))).flat();
      return {
        controlled: Boolean(navigator.serviceWorker.controller),
        controllerScript: navigator.serviceWorker.controller?.scriptURL || "",
        cacheNames,
        cachedUrls,
        appUrl: document.querySelector('script[src*="app.js"]')?.src || "",
        cssUrl: document.querySelector('link[href*="styles.css"]')?.href || "",
      };
    });
    expect(cacheState.controlled).toBe(true);
    expect(cacheState.controllerScript).toContain("/sw.js");
    expect(cacheState.cacheNames.some((name) => /^bike-packing-prototype-v\d+$/.test(name))).toBe(true);
    expect(cacheState.appUrl).toMatch(/\/app\.js\?v=\d+$/);
    expect(cacheState.cssUrl).toMatch(/\/styles\.css\?v=\d+$/);
    expect(cacheState.cachedUrls).toContain(cacheState.appUrl);
    expect(cacheState.cachedUrls).toContain(cacheState.cssUrl);

    offline = true;
    await stopServer();
    const offlineAssetState = await page.evaluate(async ({ appUrl, cssUrl }) => {
      const load = async (url) => {
        try {
          const response = await fetch(url);
          return { ok: response.ok, status: response.status, fromCacheBodyLength: (await response.text()).length };
        } catch (error) {
          return { ok: false, error: String(error) };
        }
      };
      return {
        app: await load(appUrl),
        css: await load(cssUrl),
      };
    }, { appUrl: cacheState.appUrl, cssUrl: cacheState.cssUrl });
    expect(offlineAssetState.app.ok, JSON.stringify({ cacheState, offlineAssetState }, null, 2)).toBe(true);
    expect(offlineAssetState.app.fromCacheBodyLength).toBeGreaterThan(1_000);
    expect(offlineAssetState.css.ok, JSON.stringify({ cacheState, offlineAssetState }, null, 2)).toBe(true);
    expect(offlineAssetState.css.fromCacheBodyLength).toBeGreaterThan(1_000);
    const offlinePage = await context.newPage();
    // Chromium's network emulation keeps navigator.onLine=true on newly opened
    // tabs. Model the OS hint separately from the real offline network boundary.
    await offlinePage.addInitScript(() => {
      Object.defineProperty(navigator, "onLine", { get: () => window.pwaOnlineHint === true });
    });
    const navigation = await offlinePage.goto("/", { waitUntil: "domcontentloaded" });
    expect(navigation?.fromServiceWorker()).toBe(true);
    const offlineControllerState = await offlinePage.evaluate(() => ({
      controlled: Boolean(navigator.serviceWorker.controller),
      controllerScript: navigator.serviceWorker.controller?.scriptURL || "",
    }));
    expect(offlineControllerState.controlled, JSON.stringify(offlineControllerState, null, 2)).toBe(true);
    await waitForApp(offlinePage);
    await expect(offlinePage.locator("#layoutSelect option:checked")).toHaveText(layoutName);
    await expect(offlinePage.locator("#packingView [data-root-container-id]").filter({ hasText: containerName })).toHaveCount(1);
    await expect(offlinePage.locator("#packingView [data-item-id]").filter({ hasText: itemName })).toHaveCount(1);
    await expect(offlinePage.locator("body")).toHaveAttribute("data-connection-state", "offline");
    await expect(offlinePage.locator("body")).toHaveClass(/sync-offline/);
    await expect(offlinePage.locator("#syncStatus")).toContainText("Офлайн");

    const reload = await offlinePage.reload({ waitUntil: "domcontentloaded" });
    expect(reload?.fromServiceWorker()).toBe(true);
    await waitForApp(offlinePage);
    await expect(offlinePage.locator("#layoutSelect option:checked")).toHaveText(layoutName);
    await expect(offlinePage.locator("body")).toHaveAttribute("data-connection-state", "offline");
    await offlinePage.evaluate(() => { window.offlineDocumentMarker = "same-document"; });
    offline = false;
    await startServer(port);
    await offlinePage.evaluate(() => {
      window.pwaOnlineHint = true;
      window.dispatchEvent(new Event("online"));
    });
    await expect(offlinePage.locator("body")).toHaveAttribute("data-connection-state", "connected", { timeout: 15_000 });
    expect(await offlinePage.evaluate(() => window.offlineDocumentMarker)).toBe("same-document");
    await expect(offlinePage.locator("#layoutSelect option:checked")).toHaveText(layoutName);
    await expect(offlinePage.locator("#packingView [data-item-id]").filter({ hasText: itemName })).toHaveCount(1);
    await offlinePage.close();
  } finally {
    await context.close();
    if (server.listening) await stopServer();
  }
});

for (const signedOut of [false, true]) {
  test(`[pwa:offline] stalled API shows only the permitted local scope (signed out: ${signedOut})`, async ({ context, page }) => {
    await context.addInitScript(() => {
      localStorage.setItem("bike-packing-language-v1", "ru");
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = new URL(typeof input === "string" ? input : input?.url || "", location.href);
        if (url.origin === location.origin) return nativeFetch(input, init);
        if (sessionStorage.getItem("pwa-test-stalled") === "1") {
          return new Promise((_, reject) => {
            if (init?.signal?.aborted) reject(init.signal.reason);
            else init?.signal?.addEventListener("abort", () => reject(init.signal.reason), { once: true });
          });
        }
        return Promise.resolve(new Response(JSON.stringify({ ok: true, user: null, lists: [], templates: [] }), {
          status: 200, headers: { "Content-Type": "application/json" }
        }));
      };
    });
    await createGuestWorkspace(page, { layoutName: "Гостевая укладка", containerName: "Сумка", itemName: "Вещь" });
    await page.evaluate((signedOut) => {
      const saved = JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1"));
      Object.values(saved.layouts).forEach((layout) => { layout.name = "Личная укладка"; });
      localStorage.setItem("bike-packing-prototype-state-v1::id:offline-test", JSON.stringify(saved));
      localStorage.setItem("bike-packing-auth-storage-scope", "id:offline-test");
      localStorage.setItem("bike-packing-auth-user-id", "offline-test");
      localStorage.setItem("bike-packing-auth-email", "offline@example.test");
      localStorage.setItem("bike-packing-auth-signed-out", signedOut ? "1" : "0");
      sessionStorage.setItem("pwa-test-stalled", "1");
    }, signedOut);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toHaveClass(/\bapp-ready\b/, { timeout: 3500 });
    if (signedOut) {
      await expect(page.locator("#layoutSelect")).not.toContainText("Личная укладка");
      await expect(page.locator("#syncUserEmail")).not.toContainText("offline@example.test");
    } else {
      await expect(page.locator("#layoutSelect option:checked")).toHaveText("Личная укладка");
      await expect(page.locator("#syncUserEmail")).toContainText("offline@example.test");
    }
  });
}
