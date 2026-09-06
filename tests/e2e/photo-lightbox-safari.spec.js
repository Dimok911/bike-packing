import { readFile } from "node:fs/promises";
import { devices, expect, test } from "@playwright/test";

test.use({ ...devices["iPhone 16 Pro Max"] });

async function openGallery(page) {
  await page.route("https://vniipo-help.ru/shared-ui/**", (route) => route.abort());
  await page.route("**/__lightbox/**", async (route) => {
    const path = new URL(route.request().url()).pathname.split("/__lightbox/")[1];
    if (path === "fixture.html") {
      await route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="ru"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body></body></html>' });
      return;
    }
    await route.fulfill({ contentType: "text/javascript", body: await readFile(new URL(`../../${path}`, import.meta.url), "utf8") });
  });
  await page.goto("/__lightbox/fixture.html");
  await page.evaluate(async () => {
    const { openPhotoLightbox } = await import("./src/ui/photo-gallery.js");
    const gallery = document.createElement("div");
    gallery.dataset.photoGallery = "";
    for (const color of ["red", "green", "blue", "orange", "purple"]) {
      const canvas = document.createElement("canvas");
      canvas.width = 240;
      canvas.height = 320;
      const context = canvas.getContext("2d");
      context.fillStyle = color;
      context.fillRect(0, 0, 240, 320);
      const button = document.createElement("button");
      button.dataset.photoOpen = "";
      const image = new Image();
      image.src = canvas.toDataURL();
      image.dataset.photoFullSrc = `${location.origin}/slow-full/${color}.png`;
      await image.decode();
      button.append(image);
      gallery.append(button);
    }
    document.body.append(gallery);
    await openPhotoLightbox(gallery.querySelector("img"));
    window.lightboxTouch = (type, x, count = 1) => {
      const track = document.querySelector(".photo-lightbox-track");
      const event = new Event(type, { bubbles: true, cancelable: true });
      const touch = { clientX: x, clientY: 400 };
      Object.defineProperty(event, "touches", { value: Array.from({ length: count }, () => touch) });
      Object.defineProperty(event, "changedTouches", { value: [touch] });
      track.dispatchEvent(event);
    };
  });
  await expect(page.locator("dialog.photo-lightbox")).toBeVisible();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

test("adjacent previews are decoded before a swipe while original downloads are delayed", async ({ page }) => {
  const originals = [];
  let releaseDownloads;
  const held = new Promise((resolve) => { releaseDownloads = resolve; });
  await page.route("**/slow-full/**", async (route) => {
    originals.push(route.request().url());
    await held;
    await route.fulfill({ status: 503, body: "unavailable" });
  });
  try {
    await openGallery(page);
    const images = page.locator(".photo-lightbox-image");
    await expect.poll(() => images.nth(1).evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect(images.nth(2)).not.toHaveAttribute("src");
    await expect.poll(() => originals.length).toBe(1);
    expect(originals[0]).toContain("red.png");

    // Emulate a compositor position held between two snaps. Synthetic touch
    // events exercise app listeners, not physical iOS momentum.
    await page.evaluate(() => {
      const track = document.querySelector(".photo-lightbox-track");
      track.style.setProperty("scroll-snap-type", "none", "important");
      window.lightboxScrollWrites = 0;
      const scrollTo = track.scrollTo.bind(track);
      track.scrollTo = (...args) => { window.lightboxScrollWrites += 1; scrollTo(...args); };
      window.lightboxTouch("touchstart", 350);
      window.lightboxTouch("touchmove", 100);
      track.scrollLeft = track.clientWidth * 0.65;
      track.dispatchEvent(new Event("scroll"));
    });
    await expect.poll(() => images.nth(2).evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
    await page.waitForTimeout(240);
    await expect(page.locator('[data-photo-lightbox-dot="0"]')).toHaveAttribute("aria-current", "true");
    expect(await page.evaluate(() => window.lightboxScrollWrites)).toBe(0);
    expect(originals).toHaveLength(1);
    await page.evaluate(() => {
      const track = document.querySelector(".photo-lightbox-track");
      track.scrollLeft = track.clientWidth;
      window.lightboxTouch("touchend", 100, 0);
      track.dispatchEvent(new Event("scrollend"));
    });
    await expect(page.locator('[data-photo-lightbox-dot="1"]')).toHaveAttribute("aria-current", "true");
    await expect(images.nth(1)).toHaveJSProperty("naturalWidth", 240);
    expect(await page.evaluate(() => window.lightboxScrollWrites)).toBe(0);
    await expect.poll(() => originals.length).toBe(2);
  } finally {
    releaseDownloads();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("last-photo edge pulls and viewport height events preserve the last index", async ({ page }) => {
  await page.route("**/slow-full/**", (route) => route.fulfill({ status: 503, body: "unavailable" }));
  await openGallery(page);
  await page.locator('[data-photo-lightbox-dot="4"]').tap();
  await expect.poll(() => page.locator(".photo-lightbox-track").evaluate((track) => Math.abs(track.scrollLeft - track.clientWidth * 4))).toBeLessThan(2);
  const result = await page.evaluate(async () => {
    const track = document.querySelector(".photo-lightbox-track");
    let writes = 0;
    const scrollTo = track.scrollTo.bind(track);
    track.scrollTo = (...args) => { writes += 1; scrollTo(...args); };
    for (let repeat = 0; repeat < 4; repeat += 1) {
      window.lightboxTouch("touchstart", 320);
      window.lightboxTouch("touchmove", 90);
      window.visualViewport?.dispatchEvent(new Event("resize"));
      await new Promise((resolve) => setTimeout(resolve, 200));
      window.lightboxTouch("touchend", 90, 0);
      await new Promise((resolve) => setTimeout(resolve, 260));
    }
    return { writes, left: track.scrollLeft, expected: track.clientWidth * 4 };
  });
  expect(result.writes).toBe(0);
  expect(Math.abs(result.left - result.expected)).toBeLessThan(2);
  await expect(page.locator('[data-photo-lightbox-dot="4"]')).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".vpg-edge-rubber-band-dragging, .vpg-edge-rubber-band-returning")).toHaveCount(0);
});
