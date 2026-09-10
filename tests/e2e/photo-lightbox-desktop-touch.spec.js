import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test.use({
  channel: process.env.PHOTO_TOUCH_CHROME === "1" ? "chrome" : undefined,
  viewport: { width: 1920, height: 1080 }, isMobile: false, hasTouch: true
});

async function openGallery(page) {
  await page.route("https://vniipo-help.ru/shared-ui/**", route => route.abort());
  await page.route("**/src/**/*.js", async route => route.fulfill({
    contentType: "text/javascript",
    body: await readFile(resolve(`.${new URL(route.request().url()).pathname}`), "utf8")
  }));
  await page.route("**/__desktop-touch", async route => route.fulfill({
    contentType: "text/html",
    body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${await readFile("styles.css", "utf8")}</style></head><body></body></html>`
  }));
  await page.goto("/__desktop-touch");
  await page.evaluate(async () => {
    const { openPhotoLightbox } = await import("/src/ui/photo-gallery.js");
    const gallery = document.createElement("div");
    gallery.dataset.photoGallery = "";
    for (const color of ["red", "green", "blue", "orange", "purple"]) {
      const canvas = document.createElement("canvas");
      canvas.width = 700; canvas.height = 700;
      const context = canvas.getContext("2d");
      context.fillStyle = color; context.fillRect(0, 0, 700, 700);
      const button = document.createElement("button");
      button.dataset.photoOpen = "";
      const image = new Image();
      image.src = canvas.toDataURL();
      await image.decode();
      button.append(image); gallery.append(button);
    }
    document.body.append(gallery);
    await openPhotoLightbox(gallery.querySelector("img"));
  });
  await expect(page.locator("dialog.photo-lightbox")).toHaveClass(/vpg-direct-desktop/);
  await expect(page.locator(".photo-lightbox-image").first()).toBeVisible();
}

async function swipe(session, x, y, direction) {
  const point = currentX => ({ id: 1, x: currentX, y, radiusX: 6, radiusY: 6, force: 1 });
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(x)] });
  for (let step = 1; step <= 6; step++) {
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point(x + direction * step * 40)] });
    await new Promise(resolve => setTimeout(resolve, 16));
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function expectPhoto(page, index) {
  await expect(page.locator(`.photo-lightbox-slide[data-photo-lightbox-index="${index}"]`)).toBeVisible();
  await expect(page.locator(`.photo-lightbox-dot[data-photo-lightbox-dot="${index}"]`)).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".photo-lightbox-slide:visible")).toHaveCount(1);
}

async function imageTransform(page) {
  return page.locator(".photo-lightbox-slide:visible img").evaluate(image => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(image).transform);
    return { scale: matrix.a, x: matrix.e, y: matrix.f };
  });
}

test("trackpad zoom is proportional and holds the photo point beneath the cursor", async ({ page, context }) => {
  await openGallery(page);
  const session = await context.newCDPSession(page);
  try {
    const x = 1100, y = 600;
    for (let step = 1; step <= 8; step++) {
      await session.send("Input.dispatchMouseEvent", {
        type: "mouseWheel", x, y, deltaX: 0, deltaY: -2, modifiers: 2
      });
      const expectedScale = Math.exp(step * 0.02);
      await expect.poll(async () => (await imageTransform(page)).scale).toBeCloseTo(expectedScale, 3);
      const transform = await imageTransform(page);
      expect(960 + transform.x + 140 * transform.scale).toBeCloseTo(x, 1);
      expect(540 + transform.y + 60 * transform.scale).toBeCloseTo(y, 1);
    }
    // A horizontal-only wheel event must not change the scale.
    const before = await imageTransform(page);
    await session.send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 12, deltaY: 0, modifiers: 2 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(await imageTransform(page)).toEqual(before);
    // The next gesture uses a new cursor location, including an existing pan.
    const nextX = 1000, nextY = 500;
    const focalX = (nextX - 960 - before.x) / before.scale;
    const focalY = (nextY - 540 - before.y) / before.scale;
    await session.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: nextX, y: nextY, deltaX: 0, deltaY: -2, modifiers: 2 });
    await expect.poll(async () => (await imageTransform(page)).scale).toBeCloseTo(Math.exp(0.18), 3);
    const relocated = await imageTransform(page);
    expect(960 + relocated.x + focalX * relocated.scale).toBeCloseTo(nextX, 1);
    expect(540 + relocated.y + focalY * relocated.scale).toBeCloseTo(nextY, 1);
    await session.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: nextX, y: nextY, deltaX: 0, deltaY: 100, modifiers: 2 });
    await expect.poll(() => imageTransform(page)).toEqual({ scale: 1, x: 0, y: 0 });
    await expectPhoto(page, 0);
  } finally { await session.detach(); }
});

test("desktop pinch follows each finger movement and retains its off-center anchor", async ({ page, context }) => {
  await openGallery(page);
  const session = await context.newCDPSession(page);
  const points = (distance, dx = 0) => [
    { id: 1, x: 1100 + dx - distance / 2, y: 600, radiusX: 6, radiusY: 6, force: 1 },
    { id: 2, x: 1100 + dx + distance / 2, y: 600, radiusX: 6, radiusY: 6, force: 1 }
  ];
  try {
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(160) });
    for (let step = 1; step <= 8; step++) {
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(160 + step * 20, step * 2) });
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const transform = await imageTransform(page);
      expect(transform.scale).toBeCloseTo(1 + step / 8, 3);
      expect(960 + transform.x + 140 * transform.scale).toBeCloseTo(1100 + step * 2, 1);
      expect(540 + transform.y + 60 * transform.scale).toBeCloseTo(600, 1);
    }
    for (let step = 7; step >= 0; step--) {
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(160 + step * 20, step * 2) });
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const transform = await imageTransform(page);
      expect(transform.scale).toBeCloseTo(1 + step / 8, 3);
      expect(960 + transform.x + 140 * transform.scale).toBeCloseTo(1100 + step * 2, 1);
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expectPhoto(page, 0);
    await swipe(session, 960, 540, -1);
    await expectPhoto(page, 1);
  } finally { await session.detach(); }
});

for (const target of ["image", "navigation control"]) {
  test(`touch desktop traverses every fullscreen photo in both directions via ${target}`, async ({ page, context }) => {
    await openGallery(page);
    // Chrome's touch emulation reports a coarse primary pointer. Also exercise
    // the visible navigation controls of a hybrid desktop with a mouse.
    if (target === "navigation control") await page.addStyleTag({ content: ".photo-lightbox-nav {display:block!important}" });
    const session = await context.newCDPSession(page);
    try {
      for (const index of [1, 2, 3, 4, 3, 2, 1, 0]) {
        const current = Number(await page.locator('.photo-lightbox-dot[aria-current="true"]').getAttribute("data-photo-lightbox-dot"));
        const direction = index > current ? -1 : 1;
        let x = 960, y = 540;
        if (target === "navigation control") {
          const button = page.locator(direction < 0 ? ".photo-lightbox-next" : ".photo-lightbox-prev");
          const bounds = await button.boundingBox();
          x = bounds.x + bounds.width / 2; y = bounds.y + bounds.height / 2;
        }
        await swipe(session, x, y, direction);
        await expectPhoto(page, index);
      }
      await swipe(session, 960, 540, 1);
      await expectPhoto(page, 0);
      await page.locator('[data-photo-lightbox-dot="4"]').click();
      await expectPhoto(page, 4);
      await swipe(session, 960, 540, -1);
      await expectPhoto(page, 4);
    } finally { await session.detach(); }
  });
}
