import { expect, test } from "@playwright/test";
import {
  createEmptyLayout,
  createGuestWorkspace,
  createItemInContainer,
  createRootContainer,
  prepareIsolatedRussianGuest,
  waitForApp,
} from "./guest-test-helpers.js";

test.beforeEach(async ({ page }) => {
  await prepareIsolatedRussianGuest(page);
});

test("guest moves an item between bags in the same layout", async ({ page }) => {
  const itemName = "Перемещаемый насос";
  const sourceName = "Исходная сумка перемещения";
  const targetName = "Целевая сумка перемещения";
  const { container: sourceContainer, item } = await createGuestWorkspace(page, {
    layoutName: "Перемещение вещи",
    containerName: sourceName,
    itemName,
  });
  const targetContainer = await createRootContainer(page, targetName);

  await item.locator(".item-title-hitarea").click();
  await expect(page.locator("#itemDialog")).toBeVisible();
  await page.locator("#itemContainerPickerBtn").click();
  await expect(page.locator("#containerPickerDialog")).toBeVisible();
  await page.locator("#containerPickerBoard [data-pick-container]").filter({ hasText: targetName }).click();
  await expect(page.locator("#itemDialog")).toBeVisible();
  await page.locator("#saveItemBtn").click();

  await expect(sourceContainer.locator("[data-item-id]").filter({ hasText: itemName })).toHaveCount(0);
  await expect(targetContainer.locator("[data-item-id]").filter({ hasText: itemName })).toHaveCount(1);
  await page.reload();
  await waitForApp(page);
  const restoredTarget = page.locator("#packingView [data-root-container-id]").filter({ hasText: targetName });
  await expect(restoredTarget.locator("[data-item-id]").filter({ hasText: itemName })).toHaveCount(1);
});

test("guest copies an item into another layout", async ({ page }) => {
  const sourceLayoutName = "Исходная укладка копирования";
  const targetLayoutName = "Целевая укладка копирования";
  const targetContainerName = "Целевая сумка копирования";
  const itemName = "Копируемый фонарь";
  await createGuestWorkspace(page, {
    layoutName: sourceLayoutName,
    containerName: "Исходная сумка копирования",
    itemName,
  });
  await createEmptyLayout(page, targetLayoutName);
  await createRootContainer(page, targetContainerName);

  await page.locator("#layoutSelect").selectOption({ label: sourceLayoutName });
  const sourceItem = page.locator("#packingView [data-item-id]").filter({ hasText: itemName });
  await expect(sourceItem).toHaveCount(1);
  await sourceItem.locator(".item-title-hitarea").click();
  await page.locator("#itemCopyToContainerBtn").click();
  await expect(page.locator("#containerPickerDialog")).toBeVisible();
  await page.locator("#containerPickerLayoutSelect").selectOption({ label: targetLayoutName });
  await expect(page.locator("#containerPickerLayoutSelect option:checked")).toHaveText(targetLayoutName);
  await page.locator("#containerPickerBoard [data-pick-container]").filter({ hasText: targetContainerName }).click();

  await expect(page.locator("#layoutSelect option:checked")).toHaveText(targetLayoutName);
  const targetContainer = page.locator("#packingView [data-root-container-id]").filter({ hasText: targetContainerName });
  await expect(targetContainer.locator("[data-item-id]").filter({ hasText: itemName })).toHaveCount(1);
  await page.reload();
  await waitForApp(page);
  await page.locator("#layoutSelect").selectOption({ label: targetLayoutName });
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: itemName })).toHaveCount(1);
});

test("guest filters items by storage place and category and clears both filters", async ({ page }) => {
  const firstName = "Фильтруемый фонарь";
  const secondName = "Фильтруемый насос";
  const firstLocation = "Дом";
  const secondLocation = "Гараж";
  const categoryLabel = "Освещение";
  const { container, item: firstItem } = await createGuestWorkspace(page, {
    layoutName: "Фильтры вещей",
    containerName: "Сумка фильтров",
    itemName: firstName,
  });
  await createItemInContainer(page, container, secondName);

  await page.locator('[data-view="settings"]').click();
  await page.locator("#locationInput").fill(firstLocation);
  await page.locator("#locationAdd").click();
  await page.locator("#locationInput").fill(secondLocation);
  await page.locator("#locationAdd").click();
  await page.locator("#categoryInput").fill(categoryLabel);
  await page.locator("#categoryAdd").click();
  await page.locator('[data-view="packing"]').click();

  await firstItem.locator(".item-title-hitarea").click();
  await page.locator("#itemLocation").selectOption(firstLocation);
  const firstCategory = page.locator(`#itemCategoryList input[type="checkbox"][value="${categoryLabel}"]`);
  await expect(firstCategory).toBeVisible();
  await firstCategory.check();
  await page.locator("#saveItemBtn").click();

  const secondItem = container.locator("[data-item-id]").filter({ hasText: secondName });
  await secondItem.locator(".item-title-hitarea").click();
  await page.locator("#itemLocation").selectOption(secondLocation);
  await page.locator("#saveItemBtn").click();

  await page.locator("#locationFilter").selectOption(firstLocation);
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: firstName })).toBeVisible();
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: secondName })).toHaveCount(0);
  await page.locator("#clearLocationFilterBtn").click();
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: secondName })).toBeVisible();

  await page.locator("#categoryFilter").click();
  await expect(page.locator("#categoryFilterDialog")).toBeVisible();
  await page.locator(`#categoryFilterList input[type="checkbox"][value="${categoryLabel}"]`).check();
  await page.locator("#applyCategoryFilterBtn").click();
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: firstName })).toBeVisible();
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: secondName })).toHaveCount(0);
  await page.locator("#clearCategoryFilterBtn").click();
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: secondName })).toBeVisible();
});
