import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("desktop dot navigation hides empty image frames and only announces slow previews", async ({ page }) => {
  await page.route("https://vniipo-help.ru/shared-ui/**", (route) => route.abort());
  await page.route("**/__preview/**", async (route) => {
    const path = new URL(route.request().url()).pathname.split("/__preview/")[1];
    if (path === "fixture.html") {
      await route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="ru"><link rel="stylesheet" href="/styles.css"><body></body></html>' });
      return;
    }
    await route.fulfill({ contentType: "text/javascript", body: await readFile(new URL(`../../${path}`, import.meta.url), "utf8") });
  });
  await page.goto("/__preview/fixture.html");
  await page.evaluate(async () => {
    const { renderItemPhotoHtml, bindPhotoGalleries, createDemandDrivenPhotoPreviewLoader } = await import("./src/ui/photo-gallery.js");
    const photos = ["first", "fast", "slow"].map((id) => ({ id, url: `${location.origin}/${id}/full`, thumbUrl: `${location.origin}/${id}/thumb` }));
    document.body.innerHTML = renderItemPhotoHtml({ photos });
    document.querySelector(".item-photo").style.width = "360px";
    window.previewDownloads = [];
    window.previewNoticeFlashes = [];
    const loader = createDemandDrivenPhotoPreviewLoader({
      getCachedPhotoForPreview: async () => null,
      shouldPersistPreview: () => false,
      downloadCoordinator: { download: async (url) => {
        window.previewDownloads.push(url);
        if (url.includes("/slow/")) await new Promise((resolve) => { window.releaseSlowPreview = resolve; });
        return new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180"><rect width="240" height="180" fill="green"/></svg>'], { type: "image/svg+xml" });
      } }
    });
    new MutationObserver(() => {
      if (document.querySelectorAll(".photo-gallery-slide")[1].classList.contains("photo-preview-loading")) window.previewNoticeFlashes.push(true);
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class"] });
    bindPhotoGalleries(document, { photoPreviewLoader: loader });
  });
  const slides = page.locator(".photo-gallery-slide");
  await expect(slides.nth(0)).toHaveClass(/photo-preview-ready/);
  await expect(slides.nth(1).locator("img")).toHaveCSS("visibility", "hidden");
  await page.locator('[data-photo-index="1"]').click();
  await expect(slides.nth(1)).toHaveClass(/photo-preview-ready/);
  await expect(slides.nth(1).locator("img")).toHaveJSProperty("naturalWidth", 240);
  await expect(slides.nth(1).locator("img")).toHaveCSS("visibility", "visible");
  expect(await page.evaluate(() => window.previewNoticeFlashes)).toEqual([]);
  await page.locator('[data-photo-index="2"]').click();
  await expect(slides.nth(2).locator("[data-photo-preview-status]")).toBeVisible();
  await expect(slides.nth(2).locator("img")).toHaveCSS("visibility", "hidden");
  await page.evaluate(() => window.releaseSlowPreview());
  await expect(slides.nth(2)).toHaveClass(/photo-preview-ready/);
  await expect(slides.nth(2).locator("[data-photo-preview-status]")).toBeHidden();
  await page.locator('[data-photo-index="1"]').click();
  await expect(slides.nth(1).locator("img")).toHaveCSS("visibility", "visible");
  expect(await page.evaluate(() => window.previewDownloads.length)).toBe(3);
  expect(await page.evaluate(() => window.previewNoticeFlashes)).toEqual([]);
});
