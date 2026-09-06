import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Exercise the actual gallery module without account data or a warm image cache.
for (const knownDimensions of [true, false]) {
for (const sourceMode of ["direct", "separate", "failed"]) {
test(`cold fullscreen ${sourceMode} paging keeps ${knownDimensions ? "known" : "unknown"} geometry before and after image load`, async ({ page, isMobile }) => {
  await page.route("https://vniipo-help.ru/shared-ui/**", (route) => route.abort());
  await page.route("**/src/**/*.js", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    await route.fulfill({ contentType: "text/javascript", body: await readFile(resolve(`.${pathname}`), "utf8") });
  });
  let releaseImage;
  const imageGate = new Promise((resolve) => { releaseImage = resolve; });
  await page.route("**/cold-photo.svg", async (route) => {
    await imageGate;
    if (sourceMode === "failed") return route.abort();
    await route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180"><rect width="240" height="180" fill="red"/></svg>' });
  });
  await page.route("**/__photo-test", async (route) => route.fulfill({
    contentType: "text/html",
    body: `<html lang="ru"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${await readFile("styles.css", "utf8")}</style></head><body>
      <div data-photo-gallery>
        ${Array.from({ length: 2 }, () => `<button data-photo-open><img data-photo-full-src="/cold-photo.svg" data-photo-remote-thumb-src="${sourceMode === "separate" ? "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='180'%3E%3Crect width='240' height='180' fill='blue'/%3E%3C/svg%3E" : "/cold-photo.svg"}" ${knownDimensions ? 'data-photo-width="240" data-photo-height="180"' : ''}></button>`).join('')}
      </div>
      <button id="open">Open gallery</button>
      <script type="module">
        import { openPhotoLightbox } from '/src/ui/photo-gallery.js';
        document.querySelector('#open').onclick = () => openPhotoLightbox(document.querySelector('[data-photo-open] img'));
        window.photoFrames = [];
        window.blankFramesAfterPhoto = 0;
        function sample() {
          const image = document.querySelector('[data-photo-lightbox-index="1"] img');
          if (image?.naturalWidth && getComputedStyle(image).visibility === 'visible') {
            const rect = image.getBoundingClientRect();
            window.photoFrames.push({ width: rect.width, height: rect.height, src: image.currentSrc });
          } else if (window.photoFrames.length) {
            window.blankFramesAfterPhoto += 1;
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
    await expect(dialog.getByRole("status")).toBeVisible();
    await expect(dialog.getByRole("status")).toHaveText(/Загружается (полная версия )?фото…/);
    await expect(dialog.locator(".photo-lightbox-track")).toHaveAttribute("aria-busy", "true");
    if (knownDimensions) {
      await expect(next).toHaveCSS("width", "240px");
      await expect(next).toHaveCSS("height", "180px");
    }
    if (!knownDimensions || sourceMode === "separate") {
      await expect(next).toHaveCSS("visibility", "hidden");
    }
  } finally {
    releaseImage();
  }
  if (sourceMode === "failed") {
    await expect(dialog.getByRole("status")).toHaveText("Не удалось загрузить фото");
    await expect(dialog.locator(".photo-lightbox-loading-spinner")).toBeHidden();
    await expect(dialog.locator(".photo-lightbox-track")).toHaveAttribute("aria-busy", "false");
    return;
  }
  await expect.poll(() => next.evaluate((image) => image.naturalWidth)).toBe(240);
  await expect(next).toBeVisible();
  await expect(dialog.getByRole("status")).toBeHidden();
  await expect(dialog.locator(".photo-lightbox-track")).toHaveAttribute("aria-busy", "false");
  await expect(next).toHaveCSS("width", "240px");
  await expect(next).toHaveCSS("height", "180px");
  await expect.poll(() => page.evaluate(() => window.photoFrames.length)).toBeGreaterThan(30);
  const frames = await page.evaluate(() => window.photoFrames);
  expect(frames.every(({ width, height }) => Math.abs(width - 240) < 1 && Math.abs(height - 180) < 1)).toBe(true);
  expect([...new Set(frames.map(({ src }) => src))]).toEqual([await next.evaluate((image) => image.currentSrc)]);
  expect(frames.some(({ src }) => src.startsWith("data:"))).toBe(false);
  expect(await page.evaluate(() => window.blankFramesAfterPhoto)).toBe(0);
  // Keep the decoded DOM image when revisiting it, instead of unloading and
  // recreating the bitmap. Observe mutations, not just the final dimensions.
  await next.evaluate((image) => { window.loadedPhoto = image; });
  for (const index of [0, 1]) {
    if (isMobile) {
      await dialog.locator(".photo-lightbox-track").evaluate((track, i) => { track.scrollLeft = track.clientWidth * i; }, index);
    } else {
      await dialog.getByRole("button", { name: index ? "Следующее фото" : "Предыдущее фото", exact: true }).click();
    }
    await expect(dialog.locator(`[data-photo-lightbox-dot="${index}"]`)).toHaveAttribute("aria-current", "true");
    await expect(dialog.locator(`[data-photo-lightbox-index="${index}"] img`)).toBeVisible();
  }
  await expect.poll(() => next.evaluate((image) => image === window.loadedPhoto)).toBe(true);
});
}
}
