import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnv } from "vite";

test.use({ hasTouch: true });

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
    const { createModalScrollLockController } = await import("/__map-test-src/src/ui/modal-scroll-lock.js");
    createModalScrollLockController().setupModalScrollLock();
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
  expect(await page.locator('[data-trip-track-canvas]').evaluate(el=>getComputedStyle(el).cursor)).toBe("pointer");
  await page.evaluate(()=>{
    const RealMap=window.ymaps.Map;
    window.ymaps.Map=function(...args){const map=new RealMap(...args);window.liveLargeMap=map;return map;};
  });
  // Click empty map background, not the route or caption.
  await page.locator('[data-trip-track-canvas]').click({position:{x:25,y:25}});
  await expect(page.locator('.trip-track-dialog ymaps')).not.toHaveCount(0, {timeout:30000});
  await expect(page.locator('.trip-track-dialog small')).toHaveText("", {timeout:30000});
  await page.waitForTimeout(1500);
  await expect(page.locator('body')).toHaveClass(/modal-scroll-locked/);
  // Expansion stays in the top-layer dialog and leaves the page fixture intact.
  await page.locator('[data-trip-map-expand]').click();
  await expect(page.locator('.trip-track-dialog')).toHaveClass(/is-fullscreen/);
  const geometry=await page.locator('.trip-track-dialog').evaluate(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height,vw:document.documentElement.clientWidth,vh:innerHeight}));
  expect(Math.abs(geometry.w-geometry.vw)).toBeLessThan(2);expect(Math.abs(geometry.h-geometry.vh)).toBeLessThan(2);
  await expect(page.locator('#fixture [data-trip-map-card]')).toHaveCount(1);
  const initialZoom=await page.evaluate(()=>window.liveLargeMap.getZoom());
  const canvas=page.locator('.trip-track-dialog .trip-track-canvas');
  const rect=await canvas.boundingBox();const x=rect.x+rect.width/2,y=rect.y+rect.height/2;
  const client=await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{id:1,x:x-40,y:y-20},{id:2,x:x+40,y:y+20}]});
  for(let step=1;step<=12;step++) {
    await client.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{id:1,x:x-40-step*8,y:y-20-step*3},{id:2,x:x+40+step*8,y:y+20+step*3}]});
    await page.waitForTimeout(35);
  }
  await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  await client.detach();
  await expect.poll(()=>page.evaluate(()=>window.liveLargeMap.getZoom()),{timeout:10000}).toBeGreaterThan(initialZoom);
  expect(await page.evaluate(()=>window.visualViewport.scale)).toBe(1);
  await page.waitForTimeout(1500); // Let the provider paint tiles at the final zoom.
  await page.screenshot({path:testInfo.outputPath("yandex-large.png")});
  await page.keyboard.press("Escape");
  await expect(page.locator('.trip-track-dialog')).not.toHaveClass(/is-fullscreen/);
  await expect(page.locator('.trip-track-dialog')).toBeVisible();
  await expect(page.locator('.trip-track-dialog ymaps')).not.toHaveCount(0);
  await page.getByRole('button',{name:'Закрыть карту',exact:true}).click();
  await expect(page.locator('.trip-track-dialog')).toHaveCount(0);
  await page.evaluate(()=>window.testMapBinding.destroy());
  await expect(page.locator('[data-trip-track-canvas] ymaps')).toHaveCount(0);
});
