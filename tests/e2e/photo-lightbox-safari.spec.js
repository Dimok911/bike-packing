import { readFile } from "node:fs/promises";
import { devices, expect, test } from "@playwright/test";

const { defaultBrowserType, ...phoneDevice } = devices["iPhone 16 Pro Max"];
test.use(phoneDevice);

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
    window.lightboxPosition = (track = document.querySelector(".photo-lightbox-track")) => {
      const first = track.querySelector(".photo-lightbox-slide");
      return track.getBoundingClientRect().left - first.getBoundingClientRect().left;
    };
    window.lightboxFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
    window.lightboxTouch = (type, x, count = 1) => {
      const track = document.querySelector(".photo-lightbox-track");
      const event = new Event(type, { bubbles: true, cancelable: true });
      const touch = { identifier: 1, clientX: x, clientY: 400 };
      Object.defineProperty(event, "touches", { value: Array.from({ length: count }, () => touch) });
      Object.defineProperty(event, "changedTouches", { value: [touch] });
      track.dispatchEvent(event);
    };
    window.lightboxPinch = (type, distance) => {
      const track = document.querySelector(".photo-lightbox-track");
      const event = new Event(type, { bubbles: true, cancelable: true });
      const touches = [-1, 1].map((side, index) => ({
        identifier: index + 1,
        clientX: track.clientWidth / 2 + side * distance / 2,
        clientY: 400
      }));
      Object.defineProperty(event, "touches", { value: touches });
      Object.defineProperty(event, "changedTouches", { value: touches });
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
    await expect(images.nth(1)).toHaveCSS("visibility", "visible");
    await expect(images.nth(2)).not.toHaveAttribute("src");
    await expect.poll(() => originals.length).toBe(1);
    expect(originals[0]).toContain("red.png");

    // Hold a real app gesture between slides; read the painted slide position
    // instead of mutating the old scrollLeft transport.
    await page.evaluate(() => {
      const track = document.querySelector(".photo-lightbox-track");
      track.style.setProperty("scroll-snap-type", "none", "important");
      window.lightboxScrollWrites = 0;
      const scrollTo = track.scrollTo.bind(track);
      track.scrollTo = (...args) => { window.lightboxScrollWrites += 1; scrollTo(...args); };
      window.lightboxTouch("touchstart", 350);
      window.lightboxTouch("touchmove", 100);
      window.lightboxTouch("touchmove", 350 - track.clientWidth * 0.65);
    });
    await expect.poll(() => images.nth(2).evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect(images.nth(2)).toHaveCSS("visibility", "visible");
    await expect(page.locator('[data-photo-lightbox-dot="1"]')).toHaveAttribute("aria-current", "true");
    // The dot must follow the visible photo before touchend or the settle timer,
    // and reverse immediately if the user changes direction mid-gesture.
    const indicators = await page.evaluate(async () => {
      const track = document.querySelector(".photo-lightbox-track");
      const sample = async (fraction) => {
        window.lightboxTouch("touchmove", 350 - track.clientWidth * fraction);
        await window.lightboxFrame();
        return Number(document.querySelector('.photo-lightbox-dot[aria-current="true"]').dataset.photoLightboxDot);
      };
      return [await sample(0.35), await sample(0.65)];
    });
    expect(indicators).toEqual([0, 1]);
    await page.waitForTimeout(240);
    await expect(page.locator('[data-photo-lightbox-dot="1"]')).toHaveAttribute("aria-current", "true");
    expect(await page.evaluate(() => window.lightboxScrollWrites)).toBe(0);
    expect(originals).toHaveLength(1);
    await page.evaluate(() => {
      const track = document.querySelector(".photo-lightbox-track");
      window.lightboxTouch("touchmove", 350 - track.clientWidth);
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

test("slow fractional swipes paint every position and coalesce moves within each frame", async ({ page }) => {
  await page.route("**/slow-full/**", route => route.fulfill({ status: 503, body: "unavailable" }));
  await openGallery(page);
  const result = await page.evaluate(async () => {
    const track = document.querySelector(".photo-lightbox-track");
    const strip = track.querySelector(".vpg-controlled-strip");
    window.lightboxTouch("touchstart", 390);
    window.lightboxTouch("touchmove", 380);
    await window.lightboxFrame();
    let paints = 0;
    let scrollEvents = 0;
    const observer = new MutationObserver(records => { paints += records.length; });
    observer.observe(strip, { attributes: true, attributeFilter: ["style"] });
    track.addEventListener("scroll", () => { scrollEvents += 1; });
    const positions = [];
    for (let frame = 1; frame <= 12; frame += 1) {
      const expected = 10 + frame * 0.2;
      for (let move = 0; move < 4; move += 1) {
        window.lightboxTouch("touchmove", 390 - expected + (3 - move) * 0.04);
      }
      await window.lightboxFrame();
      positions.push({ expected, painted: window.lightboxPosition(track) });
    }
    observer.disconnect();
    const nativePosition = track.scrollLeft;
    window.lightboxTouch("touchend", 377.6, 0);
    return { positions, paints, scrollEvents, nativePosition };
  });
  expect(result.paints).toBe(12);
  expect(result.scrollEvents).toBe(0);
  expect(result.nativePosition).toBe(0);
  for (const { expected, painted } of result.positions) expect(Math.abs(expected - painted)).toBeLessThan(0.02);
});

test("a new pinch interrupts photo settling after the swipe finger was released", async ({ page }) => {
  await page.route("**/slow-full/**", (route) => route.fulfill({ status: 503, body: "unavailable" }));
  await openGallery(page);
  const track = page.locator(".photo-lightbox-track");
  const images = page.locator(".photo-lightbox-image");
  await expect.poll(() => images.nth(1).evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  const takeover = await page.evaluate(async () => {
    const track = document.querySelector(".photo-lightbox-track");
    const images = document.querySelectorAll(".photo-lightbox-image");
    window.lightboxTouch("touchstart", 390);
    window.lightboxTouch("touchmove", 90);
    window.lightboxTouch("touchend", 90, 0);
    const releasedAt = window.lightboxPosition(track);
    await window.lightboxFrame();
    const movingAt = window.lightboxPosition(track);
    const platformScrolling = getComputedStyle(track).overflowX;
    // This is a NEW gesture after touchend, while the previous slide animation
    // is still running. UIKit must never own momentum during this interval.
    window.lightboxPinch("touchstart", 100);
    window.lightboxPinch("touchmove", 200);
    return {
      releasedAt,
      movingAt,
      width: track.clientWidth,
      platformScrolling,
      scale: images[1].style.transform,
      previousScale: images[0].style.transform,
      stoppedAt: window.lightboxPosition(track)
    };
  });
  expect(takeover.releasedAt).toBeGreaterThan(takeover.width / 2);
  expect(takeover.movingAt).toBeGreaterThan(takeover.releasedAt);
  expect(takeover.movingAt).toBeLessThan(takeover.width - 0.02);
  expect(takeover.platformScrolling).toBe("clip");
  expect(takeover.scale).toContain("scale(2)");
  expect(takeover.previousScale).not.toContain("scale(2)");
  expect(Math.abs(takeover.stoppedAt - takeover.width)).toBeLessThan(2);
  await page.evaluate(() => window.lightboxTouch("touchend", 200, 0));
  await page.waitForTimeout(650);
  await expect(images.nth(1)).toHaveCSS("transform", /matrix\(2, 0, 0, 2,/);
  await expect(page.locator('[data-photo-lightbox-dot="1"]')).toHaveAttribute("aria-current", "true");
  await expect.poll(() => track.evaluate((node) => Math.abs(window.lightboxPosition(node) - node.clientWidth))).toBeLessThan(2);
  // Ending a later pinch at 100% permits another swipe without restoring native
  // momentum, including the reduced-motion and cancellation cleanup paths.
  await page.evaluate(() => {
    window.lightboxPinch("touchstart", 200);
    window.lightboxPinch("touchmove", 100);
    window.lightboxTouch("touchcancel", 200, 0);
    window.lightboxTouch("touchstart", 390);
    window.lightboxTouch("touchmove", 90);
    window.lightboxTouch("touchend", 90, 0);
  });
  await expect(page.locator('[data-photo-lightbox-dot="2"]')).toHaveAttribute("aria-current", "true");
  await expect.poll(() => track.evaluate((node) => Math.abs(window.lightboxPosition(node) - node.clientWidth * 2))).toBeLessThan(2);
});

for (const { direction, from, fraction, releaseSwipe } of [
  { direction: "forward drag", from: 0, fraction: 0.65, releaseSwipe: false },
  { direction: "backward settling", from: 2, fraction: 1.35, releaseSwipe: true }
]) {
  test(`pinch immediately takes over the visible photo during ${direction}`, async ({ page }) => {
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    await page.route("**/slow-full/**", async (route) => {
      await held;
      await route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640"><rect width="480" height="640" fill="green"/></svg>' });
    });
    try {
      await openGallery(page);
      if (from) await page.locator(`[data-photo-lightbox-dot="${from}"]`).tap();
      const track = page.locator(".photo-lightbox-track");
      await expect.poll(() => track.evaluate((node, index) => Math.abs(window.lightboxPosition(node) - node.clientWidth * index), from)).toBeLessThan(2);
      const visible = page.locator(".photo-lightbox-image").nth(1);
      await expect.poll(() => visible.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
      const immediate = await page.evaluate(({ from, fraction, releaseSwipe }) => {
        const track = document.querySelector(".photo-lightbox-track");
        track.style.setProperty("scroll-snap-type", "none", "important");
        window.lightboxTouch("touchstart", 350);
        window.lightboxTouch("touchmove", 100);
        window.lightboxTouch("touchmove", 350 - track.clientWidth * (fraction - from));
        if (releaseSwipe) window.lightboxTouch("touchend", 100, 0);
        window.pinchImage = document.querySelectorAll(".photo-lightbox-image")[1];
        window.lightboxPinch("touchstart", 100);
        const lockedAtStart = getComputedStyle(track).overflowX;
        // Both events run before any async source preparation or settle timer.
        window.lightboxPinch("touchmove", 200);
        return {
          lockedAtStart,
          visibleTransform: window.pinchImage.style.transform,
          previousTransform: document.querySelectorAll(".photo-lightbox-image")[from].style.transform,
          left: window.lightboxPosition(track),
          expectedLeft: track.clientWidth
        };
      }, { from, fraction, releaseSwipe });
      expect(immediate.lockedAtStart).toBe("clip");
      expect(immediate.visibleTransform).toContain("scale(2)");
      expect(immediate.previousTransform).not.toContain("scale(2)");
      expect(Math.abs(immediate.left - immediate.expectedLeft)).toBeLessThan(2);
      await expect(page.locator('[data-photo-lightbox-dot="1"]')).toHaveAttribute("aria-current", "true");
      release();
      await page.waitForTimeout(350);
      expect(await visible.evaluate((image) => image === window.pinchImage)).toBe(true);
      await expect(visible).toHaveCSS("transform", /matrix\(2, 0, 0, 2,/);
      // Finishing preparation and lifting both fingers must retain the zoom.
      await page.evaluate(() => window.lightboxTouch("touchend", 200, 0));
      await expect(visible).toHaveJSProperty("naturalWidth", 480);
      await expect(visible).toHaveCSS("transform", /matrix\(2, 0, 0, 2,/);
      // A fresh pinch back to 100% releases the track for the next swipe.
      await page.evaluate(() => {
        window.lightboxPinch("touchstart", 200);
        window.lightboxPinch("touchmove", 100);
        window.lightboxTouch("touchend", 200, 1);
      });
      await expect(track).toHaveCSS("overflow-x", "clip");
      await page.evaluate(() => window.lightboxTouch("touchend", 200, 0));
      await page.locator('[data-photo-lightbox-dot="2"]').tap();
      await expect.poll(() => track.evaluate((node) => Math.abs(window.lightboxPosition(node) - node.clientWidth * 2))).toBeLessThan(2);
    } finally {
      release();
      await page.unrouteAll({ behavior: "wait" });
    }
  });
}

test("browser-delivered new pinch takes over a released flick before it stops", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "The trusted-touch protocol is available in Chromium only");
  await page.route("**/slow-full/**", (route) => route.fulfill({ status: 503, body: "unavailable" }));
  await openGallery(page);
  const track = page.locator(".photo-lightbox-track");
  const image = page.locator(".photo-lightbox-image").nth(1);
  await expect.poll(() => image.evaluate((node) => node.complete && node.naturalWidth > 0)).toBe(true);
  const session = await page.context().newCDPSession(page);
  const point = (id, x) => ({ id, x, y: 400, radiusX: 6, radiusY: 6, force: 1 });
  try {
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(1, 390)] });
    for (const x of [340, 290, 240, 190, 140, 90]) {
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point(1, x)] });
      await page.waitForTimeout(20);
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const moving = await track.evaluate((node) => ({ left: window.lightboxPosition(node), width: node.clientWidth }));
    expect(moving.left).toBeGreaterThan(moving.width / 2);
    expect(moving.left).toBeLessThan(moving.width - 2);
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(2, 150), point(3, 250)] });
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point(2, 100), point(3, 300)] });
    await expect.poll(() => image.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).a)).toBeGreaterThan(1.9);
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(400);
    await expect.poll(() => track.evaluate((node) => Math.abs(window.lightboxPosition(node) - node.clientWidth))).toBeLessThan(2);
    await expect(image).toHaveCSS("transform", /matrix\(2, 0, 0, 2,/);
  } finally {
    await session.detach();
  }
});

test("reduced-motion paging activates the new photo after gesture cleanup", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/slow-full/**", (route) => route.fulfill({ status: 503, body: "unavailable" }));
  await openGallery(page);
  await page.evaluate(() => {
    window.lightboxTouch("touchstart", 390);
    window.lightboxTouch("touchmove", 90);
    window.lightboxTouch("touchend", 90, 0);
  });
  await expect(page.locator('[data-photo-lightbox-dot="1"]')).toHaveAttribute("aria-current", "true");
  await page.evaluate(() => {
    window.lightboxPinch("touchstart", 100);
    window.lightboxPinch("touchmove", 200);
  });
  await expect(page.locator(".photo-lightbox-image").nth(1)).toHaveCSS("transform", /matrix\(2, 0, 0, 2,/);
});

test("a swipe on the navigation control interrupts settling without jumping back", async ({ page }) => {
  await page.route("**/slow-full/**", (route) => route.fulfill({ status: 503, body: "unavailable" }));
  await openGallery(page);
  const result = await page.evaluate(async () => {
    const track = document.querySelector(".photo-lightbox-track");
    const button = document.querySelector(".photo-lightbox-next");
    window.lightboxTouch("touchstart", 390);
    window.lightboxTouch("touchmove", 90);
    window.lightboxTouch("touchend", 90, 0);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const dispatch = (type, x, count = 1) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      const touch = { identifier: 1, clientX: x, clientY: 400 };
      Object.defineProperty(event, "touches", { value: count ? [touch] : [] });
      Object.defineProperty(event, "changedTouches", { value: [touch] });
      button.dispatchEvent(event);
    };
    dispatch("touchstart", 390);
    dispatch("touchmove", 200);
    await window.lightboxFrame();
    const draggedAt = window.lightboxPosition(track);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const heldAt = window.lightboxPosition(track);
    dispatch("touchend", 200, 0);
    return { draggedAt, heldAt, releasedAt: window.lightboxPosition(track) };
  });
  expect(result.heldAt).toBe(result.draggedAt);
  expect(result.releasedAt).toBe(result.draggedAt);
  await expect.poll(() => page.locator(".photo-lightbox-track").evaluate((track) => Math.abs(window.lightboxPosition(track) - track.clientWidth * 2))).toBeLessThan(2);
  await expect(page.locator('[data-photo-lightbox-dot="2"]')).toHaveAttribute("aria-current", "true");
});

test("last-photo edge pulls and viewport height events preserve the last index", async ({ page }) => {
  await page.route("**/slow-full/**", (route) => route.fulfill({ status: 503, body: "unavailable" }));
  await openGallery(page);
  await page.locator('[data-photo-lightbox-dot="4"]').tap();
  await expect.poll(() => page.locator(".photo-lightbox-track").evaluate((track) => Math.abs(window.lightboxPosition(track) - track.clientWidth * 4))).toBeLessThan(2);
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
    return { writes, left: window.lightboxPosition(track), expected: track.clientWidth * 4 };
  });
  expect(result.writes).toBe(0);
  expect(Math.abs(result.left - result.expected)).toBeLessThan(2);
  await expect(page.locator('[data-photo-lightbox-dot="4"]')).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".vpg-edge-content-dragging, .vpg-edge-content-returning")).toHaveCount(0);
});

test("changing viewport width during a swipe keeps the nearest photo and allows another gesture", async ({ page }) => {
  await page.route("**/slow-full/**", route => route.fulfill({ status: 503, body: "unavailable" }));
  await openGallery(page);
  await page.locator('[data-photo-lightbox-dot="2"]').tap();
  const track = page.locator(".photo-lightbox-track");
  await expect.poll(() => track.evaluate(node => Math.abs(window.lightboxPosition(node) - node.clientWidth * 2))).toBeLessThan(0.1);
  await page.evaluate(async () => {
    window.lightboxTouch("touchstart", 390);
    window.lightboxTouch("touchmove", 90);
    await window.lightboxFrame();
    window.resizePhoto = document.querySelectorAll(".photo-lightbox-image")[3];
  });
  await page.setViewportSize({ width: 640, height: 440 });
  await expect.poll(() => track.evaluate(node => Math.abs(window.lightboxPosition(node) - node.clientWidth * 3))).toBeLessThan(0.1);
  await expect(page.locator('[data-photo-lightbox-dot="3"]')).toHaveAttribute("aria-current", "true");
  expect(await page.locator(".photo-lightbox-image").nth(3).evaluate(image => image === window.resizePhoto)).toBe(true);
  await page.evaluate(() => {
    window.lightboxTouch("touchend", 90, 0);
    window.lightboxTouch("touchstart", 550);
    window.lightboxTouch("touchmove", 100);
    window.lightboxTouch("touchend", 100, 0);
  });
  await expect.poll(() => track.evaluate(node => Math.abs(window.lightboxPosition(node) - node.clientWidth * 4))).toBeLessThan(0.1);
  await expect(page.locator('[data-photo-lightbox-dot="4"]')).toHaveAttribute("aria-current", "true");
});

test("an original finishing during an edge pull waits for release before replacing the preview", async ({ page }) => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  await page.route("**/slow-full/**", async (route) => {
    await held;
    await route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640"><rect width="480" height="640" fill="red"/></svg>' });
  });
  try {
    await openGallery(page);
    await page.evaluate(() => {
      window.heldPreview = document.querySelector(".photo-lightbox-image");
      window.lightboxTouch("touchstart", 100);
      window.lightboxTouch("touchmove", 300);
    });
    release();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.querySelector(".photo-lightbox-image") === window.heldPreview)).toBe(true);
    await page.evaluate(() => window.lightboxTouch("touchend", 300, 0));
    const first = page.locator(".photo-lightbox-image").first();
    await expect(first).toHaveJSProperty("naturalWidth", 480);
    await expect(first).toHaveAttribute("data-photo-lightbox-quality", "full");
    await expect.poll(() => first.evaluate((image) => getComputedStyle(image).translate)).toMatch(/^(none|0px(?: 0px)?)$/);
    await expect(page.locator(".vpg-edge-content-dragging, .vpg-edge-content-returning")).toHaveCount(0);
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});
