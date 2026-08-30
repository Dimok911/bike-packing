import { expect, test } from "@playwright/test";
import {
  createEmptyLayout,
  openApp,
  prepareIsolatedEnglishGuest,
  prepareIsolatedRussianGuest,
} from "./guest-test-helpers.js";

test.beforeEach(async ({ page }) => {
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
  await page.locator('[data-bag-catalog-family="bikepacking"]').click();
  await page.locator('[data-bag-catalog-compare-category="saddle"]').click();

  const comparison = page.locator("#bagCatalogCompareDialog");
  await expect(comparison).toBeVisible();
  await expect(comparison.locator("tbody tr")).toHaveCount(24);
  await expect(comparison).toContainText("Apidura");
  await expect(comparison).toContainText("ORTLIEB");
  await expect(comparison).toContainText("Arkel");

  await comparison.locator("#bagCatalogCompareManufacturerBtn").click();
  const filterPanel = comparison.locator("#bagCatalogCompareFilterPanel");
  await expect(filterPanel).toBeVisible();
  await filterPanel.locator("label", { hasText: "Arkel" }).locator('input[type="checkbox"]').uncheck();
  await filterPanel.locator("#bagCatalogCompareFilterApplyBtn").click();
  await expect(comparison.locator("tbody tr")).toHaveCount(19);
  await expect(comparison.locator("tbody")).not.toContainText("Arkel");

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
  await expect(page.locator(".manufacturer-catalog-product")).toHaveCount(24);
  const seatPackCard = page.locator('.manufacturer-catalog-product:has([data-bag-catalog-select="ortlieb-seat-pack-16-5l"])');
  await expect.poll(() => seatPackCard.locator(".manufacturer-catalog-photo-gallery .photo-gallery-dot").count()).toBeGreaterThan(1);
  await seatPackCard.locator("[data-photo-open]").first().click();
  await expect(page.locator("dialog.photo-lightbox")).toBeVisible();
  await page.locator("dialog.photo-lightbox .photo-lightbox-close").click();
  await page.locator('[data-bag-catalog-select="ortlieb-seat-pack-16-5l"]').click();

  await expect(page.locator("#bagCatalogDialog")).not.toBeVisible();
  await expect(page.locator("#rootContainerDialog")).toBeVisible();
  await expect(page.locator("#rootContainerName")).toHaveValue("ORTLIEB Seat-Pack 16.5 L");
  await expect(page.locator("#rootContainerWeight")).toHaveValue("490");
  await expect(page.locator("#rootContainerVolume")).toHaveValue("16,5");
  await expect(page.locator("#rootContainerPhotoPreview img")).toHaveCount(3);
  await expect(page.locator("#rootContainerNote")).toHaveValue(/Артикул \(SKU\):/);
  await expect(page.locator("#rootContainerNote")).toHaveValue(/Официальная страница: https:\/\/us\.ortlieb\.com/);
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
  await page.locator('[data-bag-catalog-compare-category="rear-pannier"]').click();

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

  await page.locator('[data-bag-catalog-category="rear-pannier"]').click();
  await page.locator('[data-bag-catalog-select="ortlieb-back-roller-20l-pair"]').click();
  await expect(page.locator("#rootContainerName")).toHaveValue("ORTLIEB Back-Roller Pair 40 L (2 × 20 L)");
  await expect(page.locator("#rootContainerWeight")).toHaveValue("1900");
  await expect(page.locator("#rootContainerVolume")).toHaveValue("40");
});
