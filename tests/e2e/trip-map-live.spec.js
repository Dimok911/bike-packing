import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnv } from "vite";

test("live Yandex map renders tiles and the GPX overlay on the configured site origin", async ({ page }, testInfo) => {
  test.skip(process.env.RUN_YANDEX_LIVE !== "1", "Opt-in provider check requires an active domain-restricted key");
  test.setTimeout(60000);
  const tileResponses = [];
  page.on("response", response => { if (/tiles/.test(new URL(response.url()).hostname) && response.ok()) tileResponses.push(response.url()); });
  const key = loadEnv("production", process.cwd()).VITE_YANDEX_MAPS_API_KEY;
  expect(Boolean(key)).toBe(true);
  // A synthetic document on the authorized application origin. No account or trip
  // data is loaded or written; the SDK and map tiles use real provider requests.
  const origin = "https://vniipo-help.ru";
  await page.route(`${origin}/bike-packing/styles.css`, async route=>route.fulfill({contentType:"text/css",body:await readFile("styles.css","utf8")}));
  await page.route(`${origin}/__map-test-src/**`, async route => {
    const relative = new URL(route.request().url()).pathname.split("/__map-test-src/")[1];
    if (!relative.startsWith("src/") || relative.includes("..")) return route.abort();
    const body = relative === "src/config/trip-map.js"
      ? `export const YANDEX_MAPS_API_KEY=${JSON.stringify(key)};`
      : await readFile(resolve(relative), "utf8");
    await route.fulfill({ contentType: "text/javascript", body });
  });
  await page.route(`${origin}/bike-packing/__map-smoke-test`, route => route.fulfill({
    contentType: "text/html", body: `<html><head><link rel="stylesheet" href="/bike-packing/styles.css"></head><body><main id="fixture" style="max-width:600px;padding:16px"></main></body></html>`
  }));
  await page.goto(`${origin}/bike-packing/__map-smoke-test`);
  await page.evaluate(async () => {
    const { renderTripTrackMap, bindTripTrackMap } = await import("/__map-test-src/src/ui/trip-track-map.js");
    const track = {name:"Проверка карты — условный трек", startedAt:"2026-09-21T08:00:00Z", segments:[[[55.75,37.60],[55.76,37.61],[55.755,37.63]]]};
    const host = document.querySelector("#fixture");
    host.innerHTML = renderTripTrackMap(track, (en,ru)=>ru);
    window.testMapBinding = bindTripTrackMap(host, track, (en,ru)=>ru);
  });
  await expect(page.locator('[data-trip-track-canvas] ymaps')).not.toHaveCount(0, {timeout:30000});
  await expect(page.locator('[data-trip-map-status]')).toHaveText("", {timeout:30000});
  await expect.poll(()=>tileResponses.length, {timeout:30000}).toBeGreaterThan(0);
  await page.waitForTimeout(1500); // Allow the real provider renderer to paint delivered tiles.
  await page.screenshot({path:testInfo.outputPath("yandex-preview.png")});
  await page.locator('[data-trip-track-open]').click();
  await expect(page.locator('.trip-track-dialog ymaps')).not.toHaveCount(0, {timeout:30000});
  await expect(page.locator('.trip-track-dialog small')).toHaveText("", {timeout:30000});
  await page.waitForTimeout(1500);
  await page.screenshot({path:testInfo.outputPath("yandex-large.png")});
  await page.getByRole('button',{name:'Закрыть карту',exact:true}).click();
  await expect(page.locator('.trip-track-dialog')).toHaveCount(0);
  await page.evaluate(()=>window.testMapBinding.destroy());
  await expect(page.locator('[data-trip-track-canvas] ymaps')).toHaveCount(0);
});
