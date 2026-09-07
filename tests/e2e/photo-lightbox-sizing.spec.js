import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Exercise the actual gallery module without account data or a warm image cache.
for (const knownDimensions of [true, false]) {
for (const sourceMode of ["direct", "absolute", "separate", "failed"]) {
test(`cold fullscreen ${sourceMode} paging keeps ${knownDimensions ? "known" : "unknown"} geometry before and after image load`, async ({ page, isMobile }) => {
    const naturalWidth = sourceMode === "absolute" ? 700 : 240;
    const naturalHeight = sourceMode === "absolute" ? 700 : 180;
    const viewport = page.viewportSize();
    const fitsAtNativeSize = naturalWidth <= viewport.width - 18 && naturalHeight <= viewport.height - 18;
    const expectedWidth = fitsAtNativeSize ? naturalWidth : viewport.width - 18;
    const expectedHeight = fitsAtNativeSize ? naturalHeight : viewport.height - 18;
    const imageFetches = [];
    await page.route("https://vniipo-help.ru/shared-ui/**", (route) => route.abort());
    await page.route("**/src/**/*.js", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      await route.fulfill({ contentType: "text/javascript", body: await readFile(resolve(`.${pathname}`), "utf8") });
    });
    let releaseImage;
    const imageGate = new Promise((resolveImage) => { releaseImage = resolveImage; });
    await page.route("**/cold-photo.svg", async (route) => {
      if (route.request().resourceType() === "fetch") imageFetches.push(route.request().url());
      await imageGate;
      if (sourceMode === "failed") return route.abort();
      if (sourceMode === "absolute") return route.fulfill({
        contentType: "image/jpeg",
        body: await readFile("tests/e2e/fixtures/photo-lightbox-square.jpg")
      });
      await route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180"><rect width="240" height="180" fill="red"/></svg>' });
    });
    await page.route("**/__photo-test", async (route) => route.fulfill({
      contentType: "text/html",
      body: `<html lang="ru"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${await readFile("styles.css", "utf8")}</style></head><body>
        <div data-photo-gallery>
          ${Array.from({ length: 2 }, () => {
            const fullUrl = sourceMode === "absolute" ? new URL("/cold-photo.svg", route.request().url()).href : "/cold-photo.svg";
            const previewUrl = sourceMode === "separate" ? "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='180'%3E%3Crect width='240' height='180' fill='blue'/%3E%3C/svg%3E" : fullUrl;
            return `<button data-photo-open><img data-photo-full-src="${fullUrl}" data-photo-remote-thumb-src="${previewUrl}" ${knownDimensions ? `data-photo-width="${naturalWidth}" data-photo-height="${naturalHeight}"` : ''}></button>`;
          }).join("")}
        </div>
        <button id="open">Open gallery</button>
        <script type="module">
          import { openPhotoLightbox } from '/src/ui/photo-gallery.js';
          document.querySelector('#open').onclick = () => openPhotoLightbox(document.querySelector('[data-photo-open] img'));
          window.photoFrames = [];
          window.blankFramesAfterPhoto = 0;
          function sample() {
            const image = document.querySelector('[data-photo-lightbox-index="1"] img');
            if (image?.naturalWidth && image.getClientRects().length && getComputedStyle(image).visibility === 'visible') {
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
        await expect(next).toHaveCSS("width", `${expectedWidth}px`);
        await expect(next).toHaveCSS("height", `${expectedHeight}px`);
      }
      if (isMobile && sourceMode === "separate") {
        await expect(next).toHaveCSS("visibility", "visible");
      } else if (!knownDimensions || sourceMode === "separate") {
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
    await expect.poll(() => next.evaluate((image) => image.naturalWidth)).toBe(naturalWidth);
    await expect(next).toBeVisible();
    await expect(dialog.getByRole("status")).toBeHidden();
    await expect(dialog.locator(".photo-lightbox-track")).toHaveAttribute("aria-busy", "false");
    await expect(next).toHaveCSS("width", `${expectedWidth}px`);
    await expect(next).toHaveCSS("height", `${expectedHeight}px`);
    await expect.poll(() => page.evaluate(() => window.photoFrames.length)).toBeGreaterThan(30);
    const frames = await page.evaluate(() => window.photoFrames);
    expect(frames.every(({ width, height }) => Math.abs(width - expectedWidth) < 1 && Math.abs(height - expectedHeight) < 1)).toBe(true);
    if (sourceMode === "absolute") expect(imageFetches).toEqual([]);
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

for (const separatePreview of [false, true]) {
  test(`cold desktop paging retains the previous bitmap until ${separatePreview ? "separate original" : "catalog photo"} is ready`, async ({ page, isMobile }) => {
    test.skip(isMobile, "Native swipe keeps its existing scroll behavior; this covers discrete desktop paging.");
    await page.route("https://vniipo-help.ru/shared-ui/**", (route) => route.abort());
    await page.route("**/src/**/*.js", async (route) => {
      await route.fulfill({
        contentType: "text/javascript",
        body: await readFile(resolve(`.${new URL(route.request().url()).pathname}`), "utf8")
      });
    });
    let releaseFirst;
    let releaseLast;
    const firstGate = new Promise((resolveFirst) => { releaseFirst = resolveFirst; });
    const lastGate = new Promise((resolveLast) => { releaseLast = resolveLast; });
    const square = await readFile("tests/e2e/fixtures/photo-lightbox-square.jpg");
    const landscape = await readFile("tests/e2e/fixtures/photo-lightbox-landscape.jpg");
    const requests = [];
    await page.route("**/paging-photo-*.jpg", async (route) => {
      const index = Number(route.request().url().match(/paging-photo-(\d+)/)[1]);
      requests.push(index);
      if (index === 1) await firstGate;
      if (index === 14) await lastGate;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, index === 2 ? 650 : 80));
      if (index === 13) return route.abort();
      await route.fulfill({ contentType: "image/jpeg", body: index % 2 ? landscape : square });
    });
    await page.route("**/__paging-test", async (route) => route.fulfill({
      contentType: "text/html",
      body: `<html lang="ru"><head><style>${await readFile("styles.css", "utf8")}</style></head><body>
        <div data-photo-gallery>${Array.from({ length: 15 }, (_, index) => {
          const src = new URL(`/paging-photo-${index}.jpg`, route.request().url()).href;
          const preview = separatePreview ? "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='blue'/%3E%3C/svg%3E" : src;
          return `<button data-photo-open><img data-photo-full-src="${src}" data-photo-remote-thumb-src="${preview}"></button>`;
        }).join("")}</div><button id="open">Open gallery</button>
        <script type="module">
          import { openPhotoLightbox } from '/src/ui/photo-gallery.js';
          document.querySelector('#open').onclick = () => openPhotoLightbox(document.querySelector('[data-photo-open] img'));
          window.pagingFrames = [];
          window.recordPaging = false;
          function sample() {
            if (window.recordPaging) {
              const image = document.querySelector('.vpg-fullscreen-active img');
              const rect = image?.getBoundingClientRect();
              window.pagingFrames.push({
                index: Number(image?.parentElement.dataset.photoLightboxIndex),
                visible: Boolean(image?.complete && image.naturalWidth && getComputedStyle(image).visibility === 'visible'),
                width: rect?.width, height: rect?.height, naturalHeight: image?.naturalHeight
              });
            }
            requestAnimationFrame(sample);
          }
          sample();
        </script></body></html>`
    }));
    await page.goto("/__paging-test");
    await page.locator("#open").click();
    const dialog = page.locator("dialog.photo-lightbox");
    const slide = (index) => dialog.locator(`[data-photo-lightbox-index="${index}"] img`);
    const key = (value) => dialog.getByRole("button", { name: "Закрыть", exact: true }).press(value);
    await expect(slide(0)).toBeVisible();
    await expect.poll(() => slide(0).evaluate((image) => image.complete && image.naturalWidth)).toBe(700);
    await page.evaluate(() => { window.recordPaging = true; });
    try {
      await key("ArrowRight");
      await expect(dialog.getByRole("status")).toBeVisible();
      await expect(slide(0)).toBeVisible();
      await expect(slide(1)).not.toBeVisible();
    } finally {
      releaseFirst();
    }
    await expect(slide(1)).toBeVisible();
    await expect(dialog.getByRole("status")).toBeHidden();
    await key("ArrowRight");
    await key("ArrowRight");
    await expect(slide(3)).toBeVisible();
    for (let index = 4; index <= 12; index += 1) {
      const started = Date.now();
      await key("ArrowRight");
      await expect(slide(index)).toBeVisible();
      await page.waitForTimeout(Math.max(0, 333 - (Date.now() - started)));
    }
    const frames = await page.evaluate(() => {
      window.recordPaging = false;
      return window.pagingFrames;
    });
    expect(frames.length).toBeGreaterThan(30);
    expect(frames.filter((frame) => !frame.visible)).toEqual([]);
    expect(frames.every(({ width, height, naturalHeight }) => width === 700 && height === naturalHeight)).toBe(true);
    expect(frames.some(({ index }) => index === 2)).toBe(false);
    await key("ArrowRight");
    if (separatePreview) {
      await expect(dialog.getByRole("status")).toHaveText("Показан сохранённый предпросмотр");
      await expect(slide(13)).toBeVisible();
    } else {
      await expect(dialog.getByRole("status")).toHaveText("Не удалось загрузить фото");
      await expect(slide(12)).toBeVisible();
    }
    await key("ArrowLeft");
    await expect(dialog.getByRole("status")).toBeHidden();
    expect([...new Set(requests)].sort((a, b) => a - b)).toEqual(Array.from({ length: 14 }, (_, index) => index));
    await key("ArrowRight");
    await key("ArrowRight");
    await expect.poll(() => requests.includes(14)).toBe(true);
    await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
    releaseLast();
    await page.waitForTimeout(200);
    await expect(dialog).toHaveCount(0);
  });
}
