import { expect, test } from "@playwright/test";
import {
  createGuestWorkspace,
  waitForApp,
} from "./guest-test-helpers.js";

test.use({ serviceWorkers: "allow" });

test("[pwa:offline] installed app shell opens the saved workspace without a network", async ({ context, page }) => {
  test.setTimeout(60_000);
  await context.addInitScript(() => {
    localStorage.setItem("bike-packing-language-v1", "ru");
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input?.url || "";
      if (url.startsWith("https://api.vniipo-help.ru/letters-vniipo/api/")) {
        return Promise.resolve(new Response(JSON.stringify({
          ok: false,
          code: "pwa_e2e_isolated",
          message: "PWA E2E uses local guest storage",
        }), {
          status: 503,
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

  await context.setOffline(true);
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
});
