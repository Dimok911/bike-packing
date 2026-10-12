import { expect, test } from "@playwright/test";
import { createGuestWorkspace, createItemInContainer, prepareIsolatedRussianGuest, waitForApp } from "./guest-test-helpers.js";

test.beforeEach(async ({ page }) => prepareIsolatedRussianGuest(page));
const selectView = (page, view) => page.locator(`.tab[data-view="${view}"]`).evaluate((tab) => tab.click());

test("duplicate finder filters items and bags and has an explicit exit", async ({ page }) => {
  const { container } = await createGuestWorkspace(page, { layoutName: "Проверка дубликатов", containerName: "Сумка А", itemName: "Насос" });
  await createItemInContainer(page, container, "Палатка");
  await selectView(page, "items");
  await page.locator('[data-list-item-id]').filter({ hasText: "Насос" }).locator('[data-copy-item]').click();
  await page.locator('#confirmOkBtn').click();
  await expect(page.locator('[data-list-item-id]').filter({ hasText: "Насос copy" })).toHaveCount(1);
  await selectView(page, "bags");
  await page.locator('[data-copy-root]').first().click();
  await page.locator('#confirmOkBtn').click();
  await page.locator('#menuBtn').click();
  await page.locator('#findDuplicatesBtn').click();
  await expect(page.locator('#bagsView [data-copy-root]')).toHaveCount(2);
  await expect(page.locator('#bagsView .catalog-duplicates-notice')).toBeVisible();
  await selectView(page, "items");
  await expect(page.locator('#itemsView [data-list-item-id]')).toHaveCount(2);
  await expect(page.locator('#itemsView')).not.toContainText("Палатка");
  await page.locator('#itemsView [data-clear-duplicate-filter]').click();
  await expect(page.locator('#itemsView [data-list-item-id]')).toHaveCount(3);
});

test("local undo restores an offline rename after a browser reload", async ({ page }) => {
  await createGuestWorkspace(page, { layoutName: "Проверка отмены", containerName: "Сумка А", itemName: "Насос" });
  await page.locator('#forceOfflineBtn').evaluate((button) => button.click());
  await selectView(page, "items");
  await page.locator('[data-list-item-id]').filter({ hasText: "Насос" }).click();
  await expect(page.locator('#itemDialog')).toBeVisible();
  await page.locator('#itemName').fill("Офлайн имя");
  await page.locator('#saveItemBtn').evaluate((button) => button.click());
  await expect(page.locator('#itemsView')).toContainText("Офлайн имя");
  await page.reload();
  await waitForApp(page);
  await page.locator('#menuBtn').click();
  await expect(page.locator('#localUndoBtn')).toBeEnabled();
  await page.locator('#localUndoBtn').click();
  await expect(page.locator('#confirmDialog')).toContainText("Офлайн имя");
  await page.locator('#confirmOkBtn').click();
  await selectView(page, "items");
  await expect(page.locator('#itemsView [data-list-item-id]')).toHaveCount(1);
  await expect(page.locator('#itemsView')).toContainText("Насос");
  await expect(page.locator('#itemsView')).not.toContainText("Офлайн имя");
});
