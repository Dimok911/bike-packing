import { expect, test } from "@playwright/test";
import {
  createEmptyLayout,
  openApp,
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
  await expect(comparison.locator("tbody tr")).toHaveCount(7);
  await expect(comparison).toContainText("ORTLIEB");
  await expect(comparison).toContainText("Arkel");

  await comparison.locator("#bagCatalogCompareManufacturerBtn").click();
  const filterPanel = comparison.locator("#bagCatalogCompareFilterPanel");
  await expect(filterPanel).toBeVisible();
  await filterPanel.locator("label", { hasText: "Arkel" }).locator('input[type="checkbox"]').uncheck();
  await filterPanel.locator("#bagCatalogCompareFilterApplyBtn").click();
  await expect(comparison.locator("tbody tr")).toHaveCount(4);
  await expect(comparison.locator("tbody")).not.toContainText("Arkel");

  await comparison.locator('[data-bag-comparison-detail="ortlieb-seat-pack"]').click();
  const details = page.locator("#bagCatalogProductDetailDialog");
  await expect(details).toBeVisible();
  await expect(details.locator("#bagCatalogProductDetailTitle")).toHaveText("ORTLIEB Seat-Pack");
  await expect(details).toContainText("Варианты производителя");
  await expect(details).toContainText("F9912");
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
  await expect(page.locator(".manufacturer-catalog-product")).toHaveCount(7);
  await page.locator('[data-bag-catalog-variant-select="ortlieb-seat-pack"]').selectOption("F9902");
  await page.locator('[data-bag-catalog-select="ortlieb-seat-pack"]').click();

  await expect(page.locator("#bagCatalogDialog")).not.toBeVisible();
  await expect(page.locator("#rootContainerDialog")).toBeVisible();
  await expect(page.locator("#rootContainerName")).toHaveValue("ORTLIEB Seat-Pack 16.5 L");
  await expect(page.locator("#rootContainerWeight")).toHaveValue("490");
  await expect(page.locator("#rootContainerVolume")).toHaveValue("16,5");
  await expect(page.locator("#rootContainerPhotoPreview img")).toHaveCount(1);
});
