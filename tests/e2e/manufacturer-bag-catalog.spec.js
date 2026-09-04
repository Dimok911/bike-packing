import { expect, test } from "@playwright/test";
import {
  createEmptyLayout,
  openApp,
  prepareIsolatedEnglishGuest,
  prepareIsolatedRussianGuest,
} from "./guest-test-helpers.js";

const MOBILE_WEBKIT_CATALOG_TEST = "manufacturer catalog keeps a fixed mobile frame and a swipeable brand rail";

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile-webkit" && testInfo.title !== MOBILE_WEBKIT_CATALOG_TEST,
    "The focused mobile WebKit catalog flow is covered separately."
  );
  await prepareIsolatedRussianGuest(page);
});

test("manufacturer catalog compares one type and copies an ORTLIEB photo into a user bag", async ({ page }) => {
  await openApp(page);
  await createEmptyLayout(page, "Каталог производителей");

  await page.locator("[data-add-packing-root]").click();
  await page.locator("#createRootForLayoutBtn").click();
  await expect(page.locator("#rootContainerDialog")).toBeVisible();
  await expect(page.locator("#openBagCatalogBtn")).toBeVisible();
  await page.locator("#openBagCatalogBtn").click();

  await expect(page.locator("#bagCatalogDialog")).toBeVisible();
  const brandPicker = page.locator("#bagCatalogBrands");
  await expect(brandPicker.locator('button[data-bag-catalog-brand]:not([data-bag-catalog-brand="all"])')).toHaveCount(8);
  await expect(brandPicker.locator(".manufacturer-brand-choice.is-planned")).toHaveCount(3);
  await expect(brandPicker.locator('img[alt="Apidura"]')).toBeVisible();
  await expect(brandPicker.locator('img[alt="Miss Grape"]')).toBeVisible();
  await expect(brandPicker.locator('img[alt="CYCLITE"]')).toBeVisible();
  await brandPicker.locator('[data-bag-catalog-brand="apidura"]').click();
  await expect(page.locator("#bagCatalogPath")).toHaveText("Apidura");
  await expect(page.locator('[data-bag-catalog-family="bikepacking"]')).toBeVisible();
  await expect(page.locator('[data-bag-catalog-family="carry"]')).toHaveCount(0);
  await page.locator('[data-bag-catalog-family="bikepacking"]').click();
  await expect(page.locator('[data-bag-catalog-category="saddle"]')).toBeVisible();
  await brandPicker.evaluate((element) => { element.scrollLeft = 120; });
  await brandPicker.locator('[data-bag-catalog-brand="restrap"]').click();
  await expect(page.locator("#bagCatalogPath")).toHaveText(/Restrap \/ .+/);
  await expect(page.locator('[data-bag-catalog-family="bikepacking"]')).toHaveCount(0);
  await expect(page.locator('[data-bag-catalog-category="saddle"]')).toBeVisible();
  await expect.poll(() => brandPicker.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await brandPicker.locator('[data-bag-catalog-brand="all"]').click();
  await expect(page.locator('[data-bag-catalog-category="saddle"]')).toBeVisible();
  await page.locator('[data-bag-catalog-compare-category="saddle"]').click();

  const comparison = page.locator("#bagCatalogCompareDialog");
  await expect(comparison).toBeVisible();
  await expect(comparison.locator("tbody tr")).toHaveCount(46);
  await expect(comparison.locator('.manufacturer-comparison-brand img[alt="Apidura"]')).toHaveCount(12);
  await expect(comparison.locator('.manufacturer-comparison-brand img[alt="ORTLIEB"]')).toHaveCount(8);
  await expect(comparison.locator('.manufacturer-comparison-brand img[alt="Arkel"]')).toHaveCount(5);
  await expect(comparison.locator('.manufacturer-comparison-brand img[alt="Restrap"]')).toHaveCount(7);
  await expect(comparison.locator('.manufacturer-comparison-brand img[alt="Revelate Designs"]')).toHaveCount(7);
  await expect(comparison.locator('.manufacturer-comparison-brand img[alt="Miss Grape"]')).toHaveCount(4);
  await expect(comparison.locator('.manufacturer-comparison-brand img[alt="CYCLITE"]')).toHaveCount(3);
  await expect(comparison.locator('.manufacturer-comparison-brand:has(img[alt="Revelate Designs"])').first())
    .toHaveCSS("background-color", "rgb(39, 49, 45)");

  await comparison.locator("#bagCatalogCompareManufacturerBtn").click();
  const filterPanel = comparison.locator("#bagCatalogCompareFilterPanel");
  await expect(filterPanel).toBeVisible();
  await filterPanel.locator('label:has(img[alt="Arkel"]) input[type="checkbox"]').uncheck();
  await filterPanel.locator("#bagCatalogCompareFilterApplyBtn").click();
  await expect(comparison.locator("tbody tr")).toHaveCount(41);
  await expect(comparison.locator('tbody .manufacturer-comparison-brand img[alt="Arkel"]')).toHaveCount(0);

  await comparison.locator('[data-bag-comparison-detail="ortlieb-seat-pack-11l"]').click();
  const details = page.locator("#bagCatalogProductDetailDialog");
  await expect(details).toBeVisible();
  await expect(details.locator("#bagCatalogProductDetailTitle")).toHaveText("ORTLIEB Seat-Pack 11 L");
  await expect(details).toContainText("Варианты производителя");
  await expect(details).toContainText("F9912");
  await expect.poll(() => details.locator(".manufacturer-product-detail-gallery [data-photo-open]").count()).toBeGreaterThan(1);
  await details.locator(".manufacturer-product-detail-gallery [data-photo-open]").first().click();
  await expect(page.locator("dialog.photo-lightbox")).toBeVisible();
  await expect.poll(() => page.locator("dialog.photo-lightbox .photo-lightbox-dot").count()).toBeGreaterThan(1);
  await page.locator("dialog.photo-lightbox .photo-lightbox-close").click();
  await details.locator('button[value="cancel"]').click();

  await comparison.locator('[data-bag-comparison-filter="volume"]').click();
  await filterPanel.locator("#bagCatalogCompareRangeMin").fill("16,5");
  await filterPanel.locator("#bagCatalogCompareRangeMax").fill("16,5");
  await filterPanel.locator("#bagCatalogCompareFilterApplyBtn").click();
  await expect(comparison.locator("tbody")).toContainText("Seat-Pack");
  await expect(comparison.locator('[data-bag-comparison-heading="volume"]')).toHaveAttribute("aria-sort", "none");

  await comparison.locator('[data-bag-comparison-filter="volume"]').click();
  await filterPanel.locator("#bagCatalogCompareSortDescBtn").click();
  await expect(comparison.locator('[data-bag-comparison-heading="volume"]')).toHaveAttribute("aria-sort", "descending");
  await comparison.locator('button[value="cancel"]').click();

  await page.locator('[data-bag-catalog-category="saddle"]').click();
  await expect(page.locator(".manufacturer-catalog-product")).toHaveCount(12);
  await expect.poll(() => page.locator('.manufacturer-catalog-photo-gallery img[src]').count()).toBeGreaterThan(0);
  await expect.poll(() => page.locator('.manufacturer-catalog-photo-gallery img[data-manufacturer-catalog-src]:not([src])').count()).toBeGreaterThan(0);
  await page.locator("#bagCatalogResults").evaluate((root) => {
    while (root.querySelector("[data-bag-catalog-load-more]")) {
      root.querySelector("[data-bag-catalog-load-more]").click();
    }
  });
  await expect(page.locator(".manufacturer-catalog-product")).toHaveCount(46);
  const seatPackCard = page.locator('.manufacturer-catalog-product:has([data-bag-catalog-select="ortlieb-seat-pack-16-5l"])');
  await expect.poll(() => seatPackCard.locator(".manufacturer-catalog-photo-gallery .photo-gallery-dot").count()).toBeGreaterThan(1);
  await seatPackCard.locator("[data-photo-open]").first().click();
  await expect(page.locator("dialog.photo-lightbox")).toBeVisible();
  await page.locator("dialog.photo-lightbox .photo-lightbox-close").click();
  await page.locator('[data-bag-catalog-select="ortlieb-seat-pack-16-5l"]').click();

  await expect(page.locator("#bagCatalogDialog")).not.toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#rootContainerDialog")).toBeVisible();
  await expect(page.locator("#rootContainerName")).toHaveValue("ORTLIEB Seat-Pack 16.5 L");
  await expect(page.locator("#rootContainerWeight")).toHaveValue("490");
  await expect(page.locator("#rootContainerVolume")).toHaveValue("16,5");
  await expect(page.locator("#rootContainerPhotoPreview img")).toHaveCount(3);
  await expect(page.locator("#rootContainerNote")).toHaveValue(/Артикул \(SKU\):/);
  await expect(page.locator("#rootContainerNote")).toHaveValue(/Официальная страница: https:\/\/us\.ortlieb\.com/);
});

test(MOBILE_WEBKIT_CATALOG_TEST, async ({ page }) => {
  const catalogChunks = [];
  page.on("request", (request) => {
    if (/\/(?:ortlieb|apidura|restrap|tailfin|arkel|revelate-designs|miss-grape|cyclite)\.generated-[^/]+\.js(?:\?|$)/.test(request.url())) {
      catalogChunks.push(request.url());
    }
  });
  await page.setViewportSize({ width: 390, height: 720 });
  await openApp(page);
  await createEmptyLayout(page, "Мобильный каталог");

  await page.locator("[data-add-packing-root]").click();
  await page.locator("#createRootForLayoutBtn").click();
  await page.locator("#openBagCatalogBtn").click();

  const dialog = page.locator("#bagCatalogDialog");
  const brandPicker = page.locator("#bagCatalogBrands");
  const results = page.locator("#bagCatalogResults");
  await expect(dialog).toBeVisible();
  expect(catalogChunks).toEqual([]);
  const before = await dialog.evaluate((element) => {
    const dialogRect = element.getBoundingClientRect();
    const brands = element.querySelector("#bagCatalogBrands");
    const brandRect = brands.getBoundingClientRect();
    const resultRect = element.querySelector("#bagCatalogResults").getBoundingClientRect();
    const style = getComputedStyle(brands);
    return {
      dialogTop: dialogRect.top,
      dialogHeight: dialogRect.height,
      brandTop: brandRect.top,
      resultTop: resultRect.top,
      brandClientWidth: brands.clientWidth,
      brandScrollWidth: brands.scrollWidth,
      overflowX: style.overflowX,
      touchAction: style.touchAction
    };
  });
  expect(before.dialogHeight).toBeGreaterThan(650);
  expect(before.brandScrollWidth).toBeGreaterThan(before.brandClientWidth);
  expect(["auto", "scroll"]).toContain(before.overflowX);
  expect(before.touchAction).toContain("pan-y");

  await brandPicker.locator('[data-bag-catalog-brand="apidura"]').click();
  await expect(page.locator("#bagCatalogPath")).toHaveText("Apidura");
  await brandPicker.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const options = {
      bubbles: true,
      pointerType: "touch",
      pointerId: 41,
      isPrimary: true,
      clientX: rect.right - 24,
      clientY: rect.top + rect.height / 2
    };
    element.dispatchEvent(new PointerEvent("pointerdown", options));
    element.dispatchEvent(new PointerEvent("pointermove", { ...options, clientX: rect.left + 80 }));
    element.dispatchEvent(new PointerEvent("pointerup", { ...options, clientX: rect.left + 80 }));
  });
  await expect.poll(() => brandPicker.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await page.locator('[data-bag-catalog-family="bikepacking"]').click();
  await page.locator('[data-bag-catalog-category="saddle"]').click();
  await expect(page.locator(".manufacturer-catalog-product").first()).toBeVisible();
  await expect.poll(() => catalogChunks.some((url) => /\/apidura\.generated-/.test(url))).toBe(true);
  expect(catalogChunks.some((url) => !/\/apidura\.generated-/.test(url))).toBe(false);
  const after = await dialog.evaluate((element) => {
    const dialogRect = element.getBoundingClientRect();
    const brandRect = element.querySelector("#bagCatalogBrands").getBoundingClientRect();
    const resultRect = element.querySelector("#bagCatalogResults").getBoundingClientRect();
    return {
      dialogTop: dialogRect.top,
      dialogHeight: dialogRect.height,
      brandTop: brandRect.top,
      resultTop: resultRect.top
    };
  });
  expect(after.dialogTop).toBeCloseTo(before.dialogTop, 0);
  expect(after.dialogHeight).toBeCloseTo(before.dialogHeight, 0);
  expect(after.brandTop).toBeCloseTo(before.brandTop, 0);
  expect(after.resultTop).toBeCloseTo(before.resultTop, 0);
  await expect.poll(() => brandPicker.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await expect(results).toBeVisible();
});

for (const scenario of [
  { name: "desktop Russian", language: "ru", viewport: { width: 1280, height: 800 }, apply: "Применить", layoutName: "Проверка фильтров" },
  { name: "mobile English", language: "en", viewport: { width: 390, height: 720 }, apply: "Apply", layoutName: "Filter panel" }
]) {
  test(`all comparison filters keep actions visible on ${scenario.name}`, async ({ page }) => {
    if (scenario.language === "en") await prepareIsolatedEnglishGuest(page);
    await page.setViewportSize(scenario.viewport);
    await openApp(page);
    await createEmptyLayout(page, scenario.layoutName);
    await page.locator("[data-add-packing-root]").click();
    await page.locator("#createRootForLayoutBtn").click();
    await page.locator("#openBagCatalogBtn").click();
    await page.locator('[data-bag-catalog-family="bikepacking"]').click();
    await page.locator('[data-bag-catalog-compare-category="saddle"]').click();

    const comparison = page.locator("#bagCatalogCompareDialog");
    const panel = comparison.locator("#bagCatalogCompareFilterPanel");
    const apply = panel.locator("#bagCatalogCompareFilterApplyBtn");
    const columns = ["manufacturer", "model", "volume", "weight", "dimensions", "waterproof", "mounting", "set", "availability", "source"];

    for (const column of columns) {
      await comparison.locator(`[data-bag-comparison-filter="${column}"]`).click();
      await expect(panel).toBeVisible();
      await expect(apply).toBeVisible();
      await expect(apply).toHaveText(scenario.apply);
      const geometry = await panel.evaluate((element) => {
        const panelRect = element.getBoundingClientRect();
        const footerRect = element.querySelector("footer").getBoundingClientRect();
        const viewport = window.visualViewport;
        const top = viewport?.offsetTop || 0;
        const bottom = top + (viewport?.height || window.innerHeight);
        return {
          panelTop: panelRect.top,
          panelBottom: panelRect.bottom,
          footerTop: footerRect.top,
          footerBottom: footerRect.bottom,
          viewportTop: top,
          viewportBottom: bottom
        };
      });
      expect(geometry.panelTop).toBeGreaterThanOrEqual(geometry.viewportTop - 1);
      expect(geometry.panelBottom).toBeLessThanOrEqual(geometry.viewportBottom + 1);
      expect(geometry.footerTop).toBeGreaterThanOrEqual(geometry.panelTop);
      expect(geometry.footerBottom).toBeLessThanOrEqual(geometry.panelBottom + 1);
      if (column === "volume" || column === "weight") {
        await expect(panel.locator("#bagCatalogCompareRangeFields")).toBeVisible();
      }
      await panel.locator("#bagCatalogCompareFilterCloseBtn").click();
    }

    await comparison.locator('[data-bag-comparison-filter="model"]').click();
    await panel.locator("#bagCatalogCompareSortAscBtn").click();
    await expect(comparison.locator('[data-bag-comparison-heading="model"]')).toHaveAttribute("aria-sort", "ascending");
    await comparison.locator('[data-bag-comparison-filter="weight"]').click();
    await panel.locator("#bagCatalogCompareSortDescBtn").click();
    await expect(comparison.locator('[data-bag-comparison-heading="weight"]')).toHaveAttribute("aria-sort", "descending");
  });
}

test("ORTLIEB pair shows and imports the set total while preserving the per-bag value", async ({ page }) => {
  await openApp(page);
  await createEmptyLayout(page, "Пара паниров");

  await page.locator("[data-add-packing-root]").click();
  await page.locator("#createRootForLayoutBtn").click();
  await page.locator("#openBagCatalogBtn").click();
  await page.locator('[data-bag-catalog-family="panniers"]').click();
  await expect(page.locator('[data-bag-catalog-category="pannier"]')).toContainText("Паниры");
  await expect(page.locator('[data-bag-catalog-category="rear-pannier"]')).toHaveCount(0);
  await page.locator('[data-bag-catalog-compare-category="pannier"]').click();

  const comparison = page.locator("#bagCatalogCompareDialog");
  const singleBackRoller = comparison.locator('[data-bag-comparison-detail="ortlieb-back-roller-20l"]').locator("xpath=ancestor::tr");
  await expect(singleBackRoller).toContainText("Quick-Lock2.1 / Quick-Lock3.1");
  const backRoller = comparison.locator('[data-bag-comparison-detail="ortlieb-back-roller-20l-pair"]').locator("xpath=ancestor::tr");
  await expect(backRoller).toContainText("20 л одна сумка (40 л комплект)");
  const compositeSet = comparison.locator('[data-bag-comparison-detail="arkel-gt-54-classic-touring-panniers"]').locator("xpath=ancestor::tr");
  await expect(compositeSet).toContainText("54 л неделимый комплект · объём одной сумки неприменим");
  await expect(compositeSet).toContainText("Составной комплект");

  await comparison.locator('[data-bag-comparison-filter="volume"]').click();
  const filterPanel = comparison.locator("#bagCatalogCompareFilterPanel");
  await expect(filterPanel).toContainText("При сортировке неделимый комплект учитывается по полному объёму");
  await filterPanel.locator("#bagCatalogCompareSortDescBtn").click();
  await expect(comparison.locator("tbody tr").first()
    .locator('[data-bag-comparison-detail="arkel-gt-54-classic-touring-panniers"]')).toHaveCount(1);

  await compositeSet.locator('[data-bag-comparison-detail="arkel-gt-54-classic-touring-panniers"]').click();
  const skuTerm = page.locator("#bagCatalogProductDetailDialog .manufacturer-catalog-sku-term");
  await expect(skuTerm).toHaveText("Артикул (SKU)");
  await expect(skuTerm).toHaveAttribute("title", /SKU \(Stock Keeping Unit\).*цвета/);
  await page.locator('#bagCatalogProductDetailDialog button[value="cancel"]').click();

  await comparison.locator('[data-bag-comparison-filter="volume"]').click();
  await filterPanel.locator("#bagCatalogCompareRangeMin").fill("20");
  await filterPanel.locator("#bagCatalogCompareRangeMax").fill("20");
  await filterPanel.locator("#bagCatalogCompareFilterApplyBtn").click();
  await expect(comparison.locator("tbody")).toContainText("Back-Roller Pair");

  await comparison.locator('[data-bag-comparison-detail="ortlieb-back-roller-20l-pair"]').click();
  const details = page.locator("#bagCatalogProductDetailDialog");
  await expect(details).toContainText("На сайте производителя — на одну сумку");
  await expect(details).toContainText("40 л комплект (20 л × 2)");
  await details.locator('button[value="cancel"]').click();
  await comparison.locator('button[value="cancel"]').click();

  const catalog = page.locator("#bagCatalogDialog");
  await catalog.locator('[data-bag-catalog-category="pannier"]').click();
  const pairSelect = catalog.locator('[data-bag-catalog-select="ortlieb-back-roller-20l-pair"]');
  await expect(pairSelect).toBeVisible();
  await pairSelect.click();
  await expect(catalog).not.toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#rootContainerName")).toHaveValue("ORTLIEB Back-Roller Pair 40 L (2 × 20 L)");
  await expect(page.locator("#rootContainerWeight")).toHaveValue("1900");
  await expect(page.locator("#rootContainerVolume")).toHaveValue("40");
});
