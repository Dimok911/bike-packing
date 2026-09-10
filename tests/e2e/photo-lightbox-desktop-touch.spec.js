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
