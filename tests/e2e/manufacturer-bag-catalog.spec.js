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
