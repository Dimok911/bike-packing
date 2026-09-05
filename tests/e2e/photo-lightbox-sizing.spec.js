import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Exercise the actual gallery module without account data or a warm image cache.
for (const knownDimensions of [true, false]) {
  test(`cold fullscreen paging keeps ${knownDimensions ? "known" : "unknown"} geometry before and after image load`, async ({ page, isMobile }) => {
    await page.route("https://vniipo-help.ru/shared-ui/**", (route) => route.abort());
    await page.route("**/src/**/*.js", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      await route.fulfill({ contentType: "text/javascript", body: await readFile(resolve(`.${pathname}`), "utf8") });
    });
    let releaseImage;
    const imageGate = new Promise((resolveImage) => { releaseImage = resolveImage; });
    await page.route("**/cold-photo.svg", async (route) => {
      await imageGate;
      await route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180"><rect width="240" height="180" fill="red"/></svg>' });
    });
    await page.route("**/__photo-test", async (route) => route.fulfill({
      contentType: "text/html",
      body: `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${await readFile("styles.css", "utf8")}</style></head><body>
        <div data-photo-gallery>
          ${Array.from({ length: 2 }, () => `<button data-photo-open><img data-photo-full-src="/cold-photo.svg" data-photo-remote-thumb-src="/cold-photo.svg" ${knownDimensions ? 'data-photo-width="240" data-photo-height="180"' : ''}></button>`).join("")}
        </div>
        <button id="open">Open gallery</button>
        <script type="module">
          import { openPhotoLightbox } from '/src/ui/photo-gallery.js';
          document.querySelector('#open').onclick = () => openPhotoLightbox(document.querySelector('[data-photo-open] img'));
          window.photoFrames = [];
          function sample() {
            const image = document.querySelector('[data-photo-lightbox-index="1"] img');
            if (image?.naturalWidth && getComputedStyle(image).visibility === 'visible') {
              const rect = image.getBoundingClientRect();
              window.photoFrames.push({ width: rect.width, height: rect.height });
            }
            requestAnimationFrame(sample);
          }
          requestAnimationFrame(sample);
        </script></body></html>`
    }));
    await page.goto("/__photo-test");
    await page.locator("#open").click();
    const dialog = page.locator("dialog.photo-lightbox");
    await expect(dialog).toBeVisible();
    if (isMobile) {
      await dialog.locator(".photo-lightbox-track").evaluate((track) => { track.scrollLeft = track.clientWidth; });
      await expect(dialog.locator('[data-photo-lightbox-dot="1"]')).toHaveAttribute("aria-current", "true");
    } else {
      await dialog.getByRole("button", { name: /Next photo|Следующее фото/, exact: true }).click();
    }
    const next = dialog.locator('[data-photo-lightbox-index="1"] img');
    try {
      if (knownDimensions) {
        await expect(next).toHaveCSS("width", "240px");
        await expect(next).toHaveCSS("height", "180px");
      } else {
        await expect(next).toHaveCSS("visibility", "hidden");
      }
    } finally {
      releaseImage();
    }
    await expect.poll(() => next.evaluate((image) => image.naturalWidth)).toBe(240);
    await expect(next).toBeVisible();
    await expect(next).toHaveCSS("width", "240px");
    await expect(next).toHaveCSS("height", "180px");
    await expect.poll(() => page.evaluate(() => window.photoFrames.length)).toBeGreaterThan(4);
    const frames = await page.evaluate(() => window.photoFrames);
    expect(frames.every(({ width, height }) => Math.abs(width - 240) < 1 && Math.abs(height - 180) < 1)).toBe(true);
  });
}
